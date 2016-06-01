# Persistent-Redux

Persistent-Redux is a drop-in middleware that will save your Redux state and restore it on the next page load.

Previously this tool focused on PouchDB but now it offers an adapter API to use any backend.

## Installation

To install the stable version:

```sh
npm install --save persistent-redux
```

This assumes that you’re using [npm](https://www.npmjs.com/) package manager with a module bundler like [Webpack](http://webpack.github.io) or [Browserify](http://browserify.org/) to consume [CommonJS modules](http://webpack.github.io/docs/commonjs.html).

## Usage

### Import
```es6
import { persistentStore } from 'persistent-redux';
import { PouchDBAdapter } from 'persistent-redux/lib/adapters';
```

### Options
```es6
const db = new PouchDB('AppState', {storage: 'persistent'});
const options = {
    adapter: new adapters.PouchDBAdapter(db, { blobSupport: true }),
    actionFilter: ((action) => action.type.indexOf('@@reduxReactRouter') !== 0),
    synchronous: true,
};
```

#### adapter
An adapter instance to wrap any storage.  See [Available Adapters](#available-adapters) below.

#### actionFilter

`actionFilter` should be a pure function that returns a boolean if an action is persistent.

#### synchronous

`synchronous` is a boolean (default to `false`) that when `true` passively saves the action.  By default, Persistent-Redux will wait for the action to register with the store before passing it on.  This process happens asynchronously.  Enable `synchronous` to not interrupt actions as they pass to redux.

### Initialization
```es6
import { createStore, compose } from 'redux';

persistentStore(options).then((persistentMiddleware) => {
    const createStoreWithMiddleware = compose(
        persistentMiddleware,
        // ... other middlewares ...
    )(createStore);

    let store = createStoreWithMiddleware(RootReducer);

    // ... use your store as you normally would here (react app etc.) ...
}).catch((err) => {
    alert('Could not initialize persistent middleware.');
    console.error(err);
});
```

### Squashing Actions

Redux stores application state as a function of `actions` and thus persistent-redux stores each of these actions.  However, building the current state by running through a large sequence of actions can unnecessarily delay startup time.  Each storage adapter for Persistent-Redux provides a utility method called `squashActions` that will squash all existing actions into a starting state that will be read at the next startup time and thus have fewer actions to reduce. Use it like this:

```es6
adapter.squashActions(rootReducer).then(() => {
    // ... successful
}).catch((err) => {
    // ... any errors will show up here
})
```

NOTE: Storages that support vacuuming or compaction could be maintained after successfully squashing actions to maintain the database size.

## Available Adapters

### PouchDB

When building your [PouchDB](http://pouchdb.com/) instance, it's recommended to specify [persistent storage for Firefox](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Browser_storage_limits_and_eviction_criteria).  PouchDB allows this through the ([currently undocumented](https://github.com/pouchdb/pouchdb/issues/4315)) `storage` option like:

```es6
import { PouchDBAdapter } from 'persistent-redux/lib/adapters';

const adapter = new PouchDBAdapter(
    new PouchDB([db name string], {storage: 'persistent'}),
    {
        initialState: {},
        actionSuffix: "-RA",
        blobSupport: false
    }
);
```

#### Adapter Options

#### initialState

`initialState` is the state (default to `{}`) to use in the event there there is nothing stored already in the database.

#### actionSuffix

`actionSuffix` is a string (default to `-RA`) that is appended to PouchDB record IDs.  Specifying this allows using the same database for multiple applications.

##### blobSupport

`blobSupport` is a boolean (default to `false`) that enables support for saving Blobs as members of actions.  Setting this to `true` can slow down your app since large blobs will be stored, or potentially sent to a server, before the action is propagated back to Redux.  Consider using the `synchronous` option of persistent-redux to mitigate this.  If you wish to support Blobs:

1. Set `blobSupport: true`
2. Add an `_attachments` property in your action as a list of strings of object paths to the Blobs.  For example (type annotations added for clarity):

    ```es6
    const REGISTER_PARTY = "party_on";

    function throwAParty(occasion: String, location: String, clipartImage: Blob) {
        return {
            type: REGISTER_PARTY,
            payload: {
                occasion,
                location,
                clipart: clipartImage
            },
            _attachments: ['payload.clipart']
        };
    }
    ```

The PouchDBAdapter supports all of the same [data-types that PouchDB supports](http://pouchdb.com/faq.html#data_types).  

## Notes

### Supported Data-types

Some Redux tools (most notably [Redux-Router](https://github.com/rackt/redux-router/issues/105)) use unsupported data-types in their actions.  These actions cannot be persisted and must be filtered by the actionFilter function.

### Asynchronous Process

Asynchronous is the common denominator of persistent storage. When an action is dispatched to the wrapped store:

1. The persistent middleware will serialize and save the action.
2. When the action is saved, the adapter will report the change back to the middleware which will re-dispatch the action to propagate to other middlewares and eventually the reducers to change the current state.  If the adapter stores to a remote database, this could slow down the interaction of your app but provides complete state sync with a remote server.
