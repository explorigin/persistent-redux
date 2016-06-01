import { FEED_CHANGED } from './constants.js';
import { defaultsTo } from './utils';

export function persistenceMiddleware(options) {
    var {
        adapter,
        actionFilter,
        synchronous
    } = options;

    actionFilter = defaultsTo(actionFilter, (() => false));

    return (/* store */) => next => {
        var ignoredActionQueue = [], waitingOnAsyncActions = 0;

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
                waitingOnAsyncActions += 1;
                adapter.saveAction(action).catch((err) => {
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
