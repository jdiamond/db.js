Higher-level library for using Indexed DB API.

Features:

- Object stores and indexes automatically created based on declarative
  schema passed in to constructor.
- Asynchronous operations are enqueued and executed in order.
- Lower-level operations available.
- API can be implemented on top of Web SQL for mobile browsers that
  don't support Indexed DB yet.
- MIT license.

Example:

    new DB('myDB', {
        version: 1,
        stores: {
            myStore: {
                keyPath: 'myId',
                indexes: {
                    keyPath: 'myProp'
                }
            }
        }
    }
    .myStore.put({
        myId: 123,
        myProp: 'foo'
    })
    .myStore.put({
        myId: 456,
        myProp: 'bar'
    })
    .myStore.get(123, function(record) {
        // record.myId should be 123
        // record.myProp should be 'foo'
    });

See specs.js for more examples.