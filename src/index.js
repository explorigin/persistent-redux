import { applyMiddleware } from 'redux';
import { FEED_CHANGED, DESIGN_DOC } from './constants.js';
import persistenceMiddleware from './middleware.js';

export function dispatchSavedActionToStore(store, init, record) {
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

export default function persistentStore({ db, ignoreAction, blobSupport, synchronous }) {
	var middleware, savedActions = [];

	blobSupport = blobSupport === undefined ? false : blobSupport;
	synchronous = synchronous === undefined ? false : synchronous;

	const createStoreWrapper = (createStore) => (reducer, initialState={}) => {
		let store = applyMiddleware(middleware)(createStore)(reducer, initialState);
		savedActions.forEach(dispatchSavedActionToStore.bind(null, store, true));

		if (!synchronous) {
			db.changes({
				live: true,
				include_docs: true,
				since: 'now',
				attachments: blobSupport,
				binary: blobSupport
			}).on('change', dispatchSavedActionToStore.bind(null, store, false));
		}
		return store;
	};

	return db.info().then((info) => {
		let { update_seq } = info;
		middleware = persistenceMiddleware(
			{
				db,
				startingSequence: update_seq,
				ignoreAction,
				blobSupport,
				synchronous
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
