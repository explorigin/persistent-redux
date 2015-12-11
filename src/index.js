import { applyMiddleware } from 'redux';

// Constants
const FEED_CHANGED = '@@persistentStore/feedChanged';
const REDUX_ACTION_TYPE = 'reduxAction';
const DESIGN_DOC = {
	_id: '_design/fetchReduxActionHistory',
	views: {
		fetchReduxActionHistory: {
			map: `function mapFun(doc) {
				if (doc.type === "${REDUX_ACTION_TYPE}") {
					emit(doc.id);
				}
			}`
		}
	}
};

// Functions
function dispatchSavedActionToStore(store, init, record) {
	let payload = record.doc.payload;
	let attachments = record.doc._attachments;

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

	store.dispatch({
		type: FEED_CHANGED,
		init: init,
		payload: payload
	});
}

function extractAttachments(action) {
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

function persistenceMiddleware(options) {
	var { db, startingSequence, ignoreAction, blobSupport } = options;

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
					waitingOnAsyncActions--;
				}
			} else if (ignoreAction(action)) {
				if (waitingOnAsyncActions) {
					ignoredActionQueue.push(action);
				} else {
					next(action);
				}
			} else {
				// TODO - detect unserializable actions in DEBUG mode
				sequence++;
				waitingOnAsyncActions++;
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
				db.put(doc).catch((err) => {
					console.log('Could not serialize action: ', action);
					console.log(err);
				});
			}
		};
	};
}

export default function persistentStore({ db, ignoreAction, blobSupport }) {
	var middleware, savedActions = [];

	blobSupport = blobSupport === undefined ? false : blobSupport;

	const createStoreWrapper = (createStore) => (reducer, initialState={}) => {
		let store = applyMiddleware(middleware)(createStore)(reducer, initialState);
		savedActions.forEach(dispatchSavedActionToStore.bind(null, store, true));

		db.changes({
			live: true,
			include_docs: true,
			since: 'now',
			attachments: blobSupport,
			binary: blobSupport
		}).on('change', dispatchSavedActionToStore.bind(null, store, false));

		return store;
	};

	return db.info().then((info) => {
		let { update_seq } = info;
		middleware = persistenceMiddleware(
			{
				db,
				startingSequence: update_seq,
				ignoreAction,
				blobSupport
			});
		return db.put(DESIGN_DOC);
	}).catch((err) => {
		if (err.status !== 409) { throw err; }
		// ignore if doc already exists
	}).then(() => {
		return db.query(
			'fetchReduxActionHistory',
			{include_docs: true, attachments: blobSupport, binary: blobSupport}
		);
	}).then((result) => {
		console.info(`Found ${result.total_rows} saved action(s).`);
		savedActions = result.rows;
		return createStoreWrapper;
	}).catch((err) => {
		if (err.message === 'missing') {
			console.info('Could not find saved state.');
			return createStoreWrapper;
		}
		console.error(err);
	});
}
