import { FEED_CHANGED } from './constants.js';


export function defaultsTo(a, defaultValue, conditional) {
    return a === conditional ? defaultValue : a;
}

export function dispatchSavedActionToStore(store, init, action) {
    store.dispatch({
        type: FEED_CHANGED,
        init: init,
        payload: action
    });
}

export function compareReduxActions(a, b) {
    return a.id.localeCompare(b.id);
}
