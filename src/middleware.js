import { FEED_CHANGED, REDUX_ACTION_TYPE } from './constants.js';

export function replaceAttachments(record) {
	let attachments = record.doc._attachments;
	let payload = record.doc.payload;

	if (attachments !== undefined) {
		Object.keys(attachments).forEach((pathString) => {
			let path = pathString.split('.');
			let currentLocation = payload;
			while (path.length > 1) {
				currentLocation = currentLocation[path.shift()];
			}
			currentLocation[path[0]] = attachments[pathString];
		});
	}
	return payload;
}

export function extractAttachments(action) {
	// FIXME - Copying the action may be unnecessary and slow here.
	let payload = { ...action }, attachments = null;

	if (Array.isArray(action._attachments)) {
		attachments = {};
		action._attachments.forEach((pathString) => {
			let path = pathString.split('.');
			let currentLocation = payload;
			while (path.length > 1) {
				currentLocation = currentLocation[path.shift()];
			}
			const lastProp = path[0];
			const data = currentLocation[lastProp];
			currentLocation[lastProp] = '_attachment';

			if (data instanceof Blob) {
				attachments[pathString] = {
					'content_type': data.type,
					'data': data
				};
			} else {
				// FIXME - Here be dragons
				attachments[pathString] = {
					'content_type': 'text/plain',
					'data': data
				};
			}
		});
		action._attachments = undefined;
	}

	return {
		payload,
		attachments
	};
}

export function persistenceMiddleware(options) {
	var {
		db,
		startingSequence,
		actionFilter,
		blobSupport,
		synchronous
	} = options;

	actionFilter = actionFilter === undefined ? (() => false) : actionFilter;

	return (/* store */) => next => {
		var ignoredActionQueue = [], waitingOnAsyncActions = 0,	sequence = startingSequence;

		return action => {
			if (action.type === FEED_CHANGED) {
				next(action.payload);
				if (waitingOnAsyncActions === 1 && ignoredActionQueue) {
					let queue = ignoredActionQueue.slice();
					queue.forEach(next);
					ignoredActionQueue = ignoredActionQueue.splice(0, queue.length);
				}
				if (!action.init) {
					waitingOnAsyncActions -= 1;
				}
			} else if (!actionFilter(action)) {
				if (waitingOnAsyncActions) {
					ignoredActionQueue.push(action);
				} else {
					next(action);
				}
			} else {
				// TODO - detect unserializable actions in DEBUG mode
				sequence += 1;
				if (blobSupport) {
					var { payload, attachments } = extractAttachments(action);
				} else {
					payload = action;
					attachments = null;
				}
				let doc = {
					_id: `RA-${sequence}`,
					type: REDUX_ACTION_TYPE,
					payload: payload
				};
				if (attachments) {
					doc._attachments = attachments;
				}
				waitingOnAsyncActions += 1;
				db.put(doc).catch((err) => {
					console.log('Could not serialize action: ', action);
					console.log(err);
				});
				if (synchronous) {
					waitingOnAsyncActions -= 1;
					next(action);
				}
			}
		};
	};
}
