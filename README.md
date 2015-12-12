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
	synchronous: true
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


## Notes

### Supported Data-types

Persistent-Redux supports all of the same [data-types that PouchDB supports](http://pouchdb.com/faq.html#data_types).  Some Redux tools (most notably [Redux-Router](https://github.com/rackt/redux-router/issues/105)) use unsupported data-types in their actions.  These actions cannot be persisted and must be filtered by the actionFilter function.

### Asynchronous Process

Because PouchDB backends are asynchronous, the persistent store is also asynchronous. When an action is dispatched to the wrapped store:

1. The persistent middleware will serialize and save the action.
2. When the action is saved, PouchDB will report the change back to the middleware which will re-dispatch the action to propagate to other middlewares and eventually the reducers to change the current state.  If PouchDB is a remote database, this could slow down the interaction of your app but provides complete state sync with a remote server.

## TODO

There are some things remaining:

- 0.9.0 - squash actions into an initial state
- 1.0.0 - test coverage
