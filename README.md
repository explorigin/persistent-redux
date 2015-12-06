# Persistent-Redux

Persistent-Redux will save your Redux state to a [PouchDB](http://pouchdb.com/) instance and restore it on the next page load.

## Installation

To install the stable version:

```
npm install --save persistent-redux
```

This assumes that you’re using [npm](https://www.npmjs.com/) package manager with a module bundler like [Webpack](http://webpack.github.io) or [Browserify](http://browserify.org/) to consume [CommonJS modules](http://webpack.github.io/docs/commonjs.html).

## Usage

```
// ... other imports ...
import persistentStore from './middlewares/persistentStore';

const options = {
	db: new PouchDB('AppState', {storage: 'persistent'}),
	ignoreAction: (() => true),
	blobSupport: true
};

# Pulling initial state from the database is an asynchronous action.
persistentStore(options).then((persistentMiddleware) => {
	const createStoreWithMiddleware = compose(
		persistentMiddleware,
    // ... other middlewares ...
	)(createStore);

	let store = createStoreWithMiddleware(RootReducer);

	render((
		<Provider store={store}>
			// ... normal JSX Components ...
		</Provider>
	), document.body);
}).catch((err) => {
	alert('Could not initialize persistent middleware.');
	console.error(err);
});
```

## Options

### db
The [PouchDB](http://pouchdb.com/) database instance that you wish to use for persistence.

When building your PouchDB instance, it's recommended to specify [persistent storage for Firefox](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Browser_storage_limits_and_eviction_criteria).  PouchDB allows this through the ([currently undocumented](https://github.com/pouchdb/pouchdb/issues/4315)) `storage` option like:

```
new PouchDB('AppState', {storage: 'persistent'})
```

### ignoreAction

`ignoreAction` is a function that returns a boolean if an action should bypass persistence.

### blobSupport

**Currently forced to `true`.  Version 0.7.0 will allow for false.***
`blobSupport` is a boolean (default to `false`) that enables support for saving Blobs as members of actions.  If you wish to support Blobs:

1. Set `blobSupport: true`
2. Add an `_attachments` property in your action as a list of strings of object paths to the Blobs.  For example (type annotations added for clarity):

	```
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

## Notes

### Supported Data-types

Persistent-Redux supports all of the same [data-types that PouchDB supports](http://pouchdb.com/faq.html#data_types).

### Asynchronous Process

Because most I/O is asynchronous, the persistent store is also asynchronous. The flow of the persistent store looks like this:

1. Fetch existing actions from the database.
2. Run these actions through the root reducer to build the initial state.
3. Return a middleware function that will apply the initial state to the created store and capture actions.

When an action is dispatched to the wrapped store:

1. The persistent middleware will serialize and save the action.
2. When the action is saved, the changes feed will report back to the middleware which will re-dispatch the action to propagate to other middlewares and eventually the reducers to change the current state.  If PouchDB is a remote database, this could slow down the interaction of your app.

### Using with Redux-Router

It is not recommended to use Persistent-Redux with [Redux-Router](https://github.com/rackt/redux-router) at this time because it [includes unserializable functions in its actions](https://github.com/rackt/redux-router/issues/105).  Until this is rectified, these actions cannot be persistent.

If you still wish to use Redux-Router, filter out its actions in the ignoreAction function:

```
{
	ignoreAction: (action) => action.type.indexOf('@@reduxReactRouter') === 0
}
```

## TODO

There are some things remaining:

- 0.7.0 - factor out blob support
- 0.8.0 - squash actions into an initial state
- 0.9.0 - add synchronous dispatching
- 1.0.0 - test coverage
