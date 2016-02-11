# Persistent-Redux

Persistent-Redux is a drop-in middleware that will save your Redux state to a [PouchDB](http://pouchdb.com/) instance and restore it on the next page load.

There are other utilities that bridge between Redux and PouchDB but they require a deeper level of code integration (special actions, wrapping components, etc.).

## Installation

To install the stable version:

```sh
npm install --save persistent-redux
```

This assumes that you’re using [npm](https://www.npmjs.com/) package manager with a module bundler like [Webpack](http://webpack.github.io) or [Browserify](http://browserify.org/) to consume [CommonJS modules](http://webpack.github.io/docs/commonjs.html).

## Usage

### Import
```es6
import persistentStore from 'persistent-redux';
```

### Options
```es6
const options = {
	db: new PouchDB('AppState', {storage: 'persistent'}),
	actionFilter: (() => true),
	blobSupport: true,
	synchronous: true,
	actionSuffix: "-RA"
};
```

#### db
The [PouchDB](http://pouchdb.com/) database instance that you wish to use for persistence.

When building your PouchDB instance, it's recommended to specify [persistent storage for Firefox](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Browser_storage_limits_and_eviction_criteria).  PouchDB allows this through the ([currently undocumented](https://github.com/pouchdb/pouchdb/issues/4315)) `storage` option like:

```es6
new PouchDB([db name string], {storage: 'persistent'});
```

#### actionFilter

`actionFilter` should be a pure function that returns a boolean if an action is persistent.

#### blobSupport

`blobSupport` is a boolean (default to `false`) that enables support for saving Blobs as members of actions.  If you wish to support Blobs:

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
#### synchronous

`synchronous` is a boolean (default to `false`) that when `true` passively save the action without interrupting it asynchronously.

#### actionSuffix

`actionSuffix` is a string (default to `-RA`) that is appended to PouchDB record IDs.  Specifying this allows using the same database for multiple applications.

### Initialization
```es6
import { createStore, compose } from 'redux';

persistentStore(options).then((persistentMiddleware) => {
	const createStoreWithMiddleware = compose(
		persistentMiddleware,
    // ... other middlewares ...
	)(createStore);

	let store = createStoreWithMiddleware(RootReducer);

	// ... use your store as you normally would here...
}).catch((err) => {
	alert('Could not initialize persistent middleware.');
	console.error(err);
});
```

### Squashing Actions

Redux stores application state as a function of `actions` and thus persistent-redux stores each of these actions.  However, building the current state by running through a large set of actions can unnecessarily delay startup time.  Persistent-Redux provides a utility function called `squashActions` that will squash all existing actions into a starting state that will be read at the next startup time and thus have fewer actions to reduce. Use it like this:

```es6
import { squashActions } from persistent-redux;

squashActions(db, reducer).then((results) => {
	// ... successful
	// `results` is the pouchdb response from the bulkDocs command that deletes action documents and sets/updates the initial state document.
}).catch((err) => {
  // ... any pouchdb errors will show up here
})
```

NOTE: You may also wish to run `db.compact()` after successfully squashing actions to maintain the database size.

## Notes

### Supported Data-types

Persistent-Redux supports all of the same [data-types that PouchDB supports](http://pouchdb.com/faq.html#data_types).  Some Redux tools (most notably [Redux-Router](https://github.com/rackt/redux-router/issues/105)) use unsupported data-types in their actions.  These actions cannot be persisted and must be filtered by the actionFilter function.

### Asynchronous Process

Because PouchDB backends are asynchronous, the persistent store is also asynchronous. When an action is dispatched to the wrapped store:

1. The persistent middleware will serialize and save the action.
2. When the action is saved, PouchDB will report the change back to the middleware which will re-dispatch the action to propagate to other middlewares and eventually the reducers to change the current state.  If PouchDB is a remote database, this could slow down the interaction of your app but provides complete state sync with a remote server.

## TODO

There are some things remaining:

- 1.0.0 - test coverage
