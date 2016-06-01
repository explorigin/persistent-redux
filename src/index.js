import { applyMiddleware } from 'redux';
import { persistenceMiddleware } from './middleware.js';
import { defaultsTo, dispatchSavedActionToStore } from './utils';
import * as adapters from './adapters';

function persistentStore({ adapter, actionFilter, synchronous }) {
    var middleware, savedState = null;

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
            adapter.onActionSaved(dispatchSavedActionToStore.bind(null, store, false));
        }
        return store;
    };

    return adapter.getStartSequence().then(startingSequence => {
        middleware = persistenceMiddleware({
            adapter,
            startingSequence,
            actionFilter,
            synchronous
        });
        return adapter.getStartState();
    }).then(
        (result) => {
            savedState = result;
            if (result.state) {
                console.info(`Found saved initialState:`, result.state);
            }
            if (result.actions.length) {
                console.info(`Applying ${result.actions.length} saved action(s).`);
            }
            return createStoreWrapper;
        },
        (err) => {
            if (err.message === 'missing') {
                console.info('Could not find saved state.');
                return createStoreWrapper;
            }
            throw err;
        }
    );
}

export {
    adapters,
    persistentStore
};
