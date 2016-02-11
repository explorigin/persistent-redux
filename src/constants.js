export const FEED_CHANGED = '@@persistentStore/feedChanged';
export const REDUX_ACTION_TYPE = 'reduxAction';
export const REDUX_ACTION_SUFFIX = '-RA';
export const INITIAL_STATE_TYPE = 'initialReduxState';
export const DESIGN_DOC = {
	_id: '_design/fetchReduxActionHistory',
	views: {
		fetchReduxActionHistory: {
			map: `function(doc) {
				if (doc.type === "${REDUX_ACTION_TYPE}") {
					emit(doc.id);
				}
			}`
		}
	}
};
