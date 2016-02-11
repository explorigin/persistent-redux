import { applyMiddleware } from 'redux';
import { FEED_CHANGED, DESIGN_DOC, INITIAL_STATE_TYPE } from './constants.js';
import { persistenceMiddleware, replaceAttachments, defaultsTo } from './middleware.js';

function dispatchSavedActionToStore(store, init, record) {
	if (!record._deleted && record.id !== INITIAL_STATE_TYPE) {
		store.dispatch({
			type: FEED_CHANGED,
			init: init,
			payload: replaceAttachments(record)
		});
	}
}

function compareReduxActions(a, b) {
	return a.id.localeCompare(b.id);
}

function getStartState(db, blobSupport) {
	var state;

	return db.get(INITIAL_STATE_TYPE).catch((/* err */) => {
		return {};
	}).then((result) => {
		state = result;

		return db.query(
			'fetchReduxActionHistory',
			{include_docs: true, attachments: blobSupport, binary: blobSupport}
		);
	}).then((result) => {
		return {
			state: state,
			actions: result.rows.sort(compareReduxActions).map(replaceAttachments),
			docs: result.rows
		};
	});
}

export function persistentStore({ db, actionFilter, blobSupport, synchronous, actionSuffix }) {
	var middleware, savedState = null;

	blobSupport = defaultsTo(blobSupport, false);
	synchronous = defaultsTo(synchronous, false);

	const createStoreWrapper = (createStore) => (reducer, firstState=null) => {
		let initialState = savedState.actions.reduce(reducer, savedState.state);
		if (initialState !== null && firstState !== null) {
			console.warn('Using previously saved initialState instead of firstState');
		} else {
			firstState = {};
		}
		let store = applyMiddleware(middleware)(createStore)(reducer, initialState || firstState);

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
		middleware = persistenceMiddleware({
			db,
			startingSequence: update_seq,
			actionFilter,
			blobSupport,
			synchronous,
			actionSuffix
		});
		return db.put(DESIGN_DOC);
	}).catch((err) => {
		if (err.status !== 409) { throw err; }
		// ignore if doc already exists
	}).then(() => {
		return getStartState(db, blobSupport);
	}).then((result) => {
		savedState = result;
		if (result.state) {
			console.info(`Found saved initialState:`, result.state);
		}
		if (result.docs.length) {
			console.info(`Applying ${result.docs.length} saved action(s).`);
		}
		return createStoreWrapper;
	}).catch((err) => {
		if (err.message === 'missing') {
			console.info('Could not find saved state.');
			return createStoreWrapper;
		}
		console.error(err);
	});
}

export function squashActions(db, reducer) {
	getStartState(db, true).then(({ state, actions, docs }) => {
		let newState = {
			...actions.reduce(reducer, state),
			_id: state._id || INITIAL_STATE_TYPE,
			_rev: state._rev
		};
		console.info(`Squashing ${actions.length} saved action(s).`);
		let removeDocs = docs.map((record) => {
			return {
				...record.doc,
				_deleted: true
			};
		});
		removeDocs.push(newState);
		return db.bulkDocs(removeDocs);
	});
}
