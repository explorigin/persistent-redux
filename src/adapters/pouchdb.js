import { REDUX_ACTION_TYPE, INITIAL_STATE_TYPE } from '../constants';
import { compareReduxActions, defaultsTo } from '../utils';


const DESIGN_DOC = {
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

function replaceAttachments(record) {
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

function extractAttachments(action) {
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


export default class PouchDBAdapter {
    constructor (store, options) {
        let {
            actionSuffix,
            initialState,
            blobSupport
        } = options;

        this.store = store;
        this.sequence = null;
        this.actionSuffix = defaultsTo(actionSuffix, '-RA');
        this.initialState = defaultsTo(initialState, {});
        this.blobSupport = defaultsTo(blobSupport, true);
        this.onActionSavedCallbacks = new Set();

        this.ready = this._initialize();
    }

    _initialize() {
        return this.store.put(DESIGN_DOC).catch((err) => {
            if (err.status !== 409) { throw err; }
            // ignore if doc already exists
        }).then(() => {
            return this.store.info();
        }).then(info => {
            this.sequence = info.update_seq || 0;
            return true;
        });
    }

    _onDbChange(record) {
        if (!record._deleted && record.id !== INITIAL_STATE_TYPE) {
            const action = replaceAttachments(record);

            this.onActionSavedCallbacks.forEach(callback => callback(action));
        }
    }

    getStartState() {
        let state;

        return this.ready.then(() => {
            return this.store.get(INITIAL_STATE_TYPE).catch((/* err */) => {
                return this.initialState;
            });
        }).then((result) => {
            state = result;

            return this.store.query(
                'fetchReduxActionHistory',
                {include_docs: true, attachments: this.blobSupport, binary: this.blobSupport}
            );
        }).then((result) => {
            return {
                state: state,
                actions: result.rows.sort(compareReduxActions).map(replaceAttachments),
                _docs: result.rows  // only used for squashActions
            };
        });
    }

    getStartSequence() {
        return this.ready.then(() => this.sequence);
    }

    onActionSaved(callback) {
        if (this.onActionSavedCallbacks.size === 0) {
            this.store.changes({
                live: true,
                include_docs: true,
                since: 'now',
                attachments: this.blobSupport,
                binary: this.blobSupport
            }).on('change', this._onDbChange.bind(this));
        }
        this.onActionSavedCallbacks.add(callback);
    }

    saveAction(action) {
        this.sequence += 1;

        if (this.blobSupport) {
            var { payload, attachments } = extractAttachments(action);
        } else {
            payload = action;
            attachments = null;
        }
        let doc = {
            _id: this.sequence.toString(36) + this.actionSuffix,
            type: REDUX_ACTION_TYPE,
            payload: payload
        };
        if (attachments) {
            doc._attachments = attachments;
        }
        return this.store.put(doc);
    }

    squashActions(reducer) {
        this.getStartState(true).then(({ state, actions, _docs }) => {
            let newState = {
                ...actions.reduce(reducer, state),
                _id: state._id || INITIAL_STATE_TYPE,
                _rev: state._rev
            };
            console.info(`Squashing ${actions.length} saved action(s).`);
            let removeDocs = _docs.map((record) => {
                return {
                    ...record.doc,
                    _deleted: true
                };
            });
            removeDocs.push(newState);
            return this.store.bulkDocs(removeDocs);
        });
    }
}
