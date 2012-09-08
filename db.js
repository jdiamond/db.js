var DB = (function(global) {

var loggingEnabled = true;

var indexedDB      = global.indexedDB      || global.webkitIndexedDB      || global.mozIndexedDB;
var IDBTransaction = global.IDBTransaction || global.webkitIDBTransaction || global.mozIDBTransaction;
var IDBKeyRange    = global.IDBKeyRange    || global.webkitIDBKeyRange    || global.mozIDBKeyRange;

var READ_ONLY = IDBTransaction.READ_ONLY;
var READ_WRITE = IDBTransaction.READ_WRITE;

function DB(name, schema) {
    this.name = name;
    this.queue = [];
    this.pending = false;
    if (schema) {
        this.open(schema);
    }
}

DB.prototype.processRecord = function(key, value, fn) {
    (fn || log)({
        key: key,
        value: value
    });
};

DB.prototype.processError = function(err) {
    // set error status on DB
    // prevent all other operations from working?
    // add method to handle errors
    console.error(err);
    this.trigger('error', err);
};

DB.prototype.open = function(schema) {
    var self = this;
    this.schema = schema;
    this.import();
    this.enqueue(function(done, fail) {
        var openRequest = indexedDB.open(self.name, schema.version);
        openRequest.onupgradeneeded = function(e) {
            upgrade(e.target.result, e.target.transaction, e.oldVersion, e.newVersion);
        };
        openRequest.onsuccess = function(e) {
            var dbObj = e.target.result;
            var oldVersion = +dbObj.version;
            if (oldVersion < schema.version) {
                if ('setVersion' in dbObj) {
                    log('old API, using setVersion');
                    var setVersionRequest = dbObj.setVersion(schema.version);
                    setVersionRequest.onsuccess = function(e) {
                        upgrade(e.target.result.db, e.target.result, oldVersion, schema.version);
                        var dbObj = e.target.result.db;
                        dbObj.close();
                        done();
                    };
                    setVersionRequest.onerror = function(e) {
                        fail(e);
                    };
                }
            } else {
                dbObj.close();
                done();
            }
        };
        openRequest.onerror = function(e) {
            fail(e);
        };
    }, 'open ' + this.name);
    function upgrade(dbObj, tx, oldVersion, newVersion) {
        log('upgrade needed for database ' + self.name +
            ' from version ' + oldVersion +
            ' to ' + newVersion);
        var stores = dbObj.objectStoreNames;
        for (var store in schema.stores) {
            var storeInfo = schema.stores[store];
            if (!stores.contains(store)) {
                log('creating store ' + store);
                dbObj.createObjectStore(store, {
                    keyPath: storeInfo.keyPath
                });
            }
            var storeObj = tx.objectStore(store);
            var indexes = storeObj.indexNames;
            for (var index in storeInfo.indexes) {
                var indexInfo = storeInfo.indexes[index];
                if (!indexes.contains(index)) {
                    log('creating index ' + store + '.' + index);
                    storeObj.createIndex(index, indexInfo.keyPath);
                }
            }
        }
    }
};

DB.prototype.import = function() {
    for (var storeName in this.schema.stores) {
        var store = this[storeName] = new DB.Store(this, storeName);
        for (var indexName in this.schema.stores[storeName].indexes) {
            store[indexName] = new DB.Index(store, indexName);
        }
    }
};

DB.prototype.delete = function() {
    var self = this;
    this.enqueue(function(done, fail) {
        indexedDB.deleteDatabase(self.name);
        done();
    }, 'deleteDatabase ' + this.name);
};

DB.prototype.store = function(name) {
    return new DB.Store(this, name);
};

DB.prototype.read = function(stores, fn, msg) {
    return this.transaction(READ_ONLY, stores, fn, msg);
};

DB.prototype.readWrite = function(stores, fn, msg) {
    return this.transaction(READ_WRITE, stores, fn, msg);
};

DB.prototype.transaction = function(mode, stores, fn, msg) {
    var self = this;
    if (typeof stores === 'string') {
        stores = Array.prototype.slice.call(arguments, 1, -2);
        fn = arguments[arguments.length - 2];
    }
    this.enqueue(function(done, fail) {
        var openRequest = indexedDB.open(self.name);
        openRequest.onsuccess = function(e) {
            var dbObj = e.target.result;
            var txObj = dbObj.transaction(stores, mode);
            // Can this event trigger before the callbacks for getters?
            txObj.oncomplete = function() {
                dbObj.close();
                done();
            };
            txObj.onerror = function(e) {
                dbObj.close();
                fail(e.target.error);
            };
            try {
                fn(new DB.Transaction(self, stores, txObj));
            } catch (e) {
                // Does calling abort guarantee another onerror gets triggered?
                txObj.abort();
                // If so, the call to fail here and in onerror is redundant.
                fail(e);
            }
        };
        openRequest.onerror = function(e) {
            fail(e);
        };
    }, msg);
    return this;
};

DB.prototype.enqueue = function(fn, msg) {
    if (msg) {
        log('enqueue: ' + msg);
    }
    this.queue.push({ fn: fn, msg: msg });
    this.dequeue();
};

DB.prototype.dequeue = function() {
    var self = this;
    if (this.queue.length && !this.pending) {
        this.pending = true;
        var entry = this.queue.shift();
        if (entry.msg) {
            log('dequeue: ' + entry.msg)
        }
        entry.fn(
            function() {
                self.pending = false;
                self.dequeue();
            },
            function(err) {
                self.pending = false;
                self.processError(err);
            });
    }
};

DB.prototype.then = function(fn, msg) {
    this.enqueue(fn, msg || 'then');
    return this;
};

DB.prototype.thenLog = function(msg) {
    this.enqueue(function(done) {
        log(msg);
        done();
    });
    return this;
};

DB.prototype.on = function(type, handler) {
    if (!this.events) {
        this.events = {};
    }
    if (!this.events[type]) {
        this.events[type] = [];
    }
    this.events[type].push(handler);
    return this;
};

DB.prototype.trigger = function(type, data) {
    if (this.events && this.events[type]) {
        for (var i = 0; i < this.events[type].length; i++) {
            this.events[type][i](data);
        }
    }
    return this;
};

DB.Store = function(db, name) {
    this.db = db;
    this.name = name;
};

DB.Store.prototype.processRecord = function(key, value, fn) {
    this.db.processRecord(key, value, fn);
};

DB.Store.prototype.getAll = function(fn) {
    var self = this;
    return this.db.read(this.name, function(tx) {
        var storeObj = tx.transaction.objectStore(self.name);
        var cursorRequest = storeObj.openCursor();
        cursorRequest.onsuccess = function(e) {
            var cursor = e.target.result;
            if (cursor) {
                self.processRecord(cursor.key, cursor.value, fn);
                cursor.continue();
            }
        };
    }, 'getAll');
};

DB.Store.prototype.get = function(key, fn) {
    var self = this;
    return this.db.read(this.name, function(tx) {
        var storeObj = tx.transaction.objectStore(self.name);
        var getRequest = storeObj.get(key);
        getRequest.onsuccess = function(e) {
            self.processRecord(key, e.target.result, fn);
        };
    }, 'get ' + key + ' from ' + this.name);
};

DB.Store.prototype.put = function(value, key) {
    var self = this;
    return this.db.readWrite(this.name, function(tx) {
        var storeObj = tx.transaction.objectStore(self.name);
        if (typeof key === 'undefined') {
            storeObj.put(value);
        } else {
            storeObj.put(value, key);
        }
    }, 'put' + (key ? ' ' + key : ''));
};

DB.Store.indexNames = function() {
    var self = this;
    this.db.read(this.name, function(tx) {
        var storeObj = tx.transaction.objectStore(self.name);
        console.log(storeObj.indexNames);
        // TODO: Callback?
    });
};

DB.Store.prototype.index = function(name) {
    return new DB.Index(this, name);
};

DB.Index = function(store, name) {
    this.store = store;
    this.name = name;
};

DB.Index.prototype.processRecord = function(key, value, fn) {
    this.store.processRecord(key, value, fn);
};

DB.Index.prototype.get = function(key, fn) {
    var self = this;
    this.store.db.read(this.store.name, function(tx) {
        var storeObj = tx.transaction.objectStore(self.store.name);
        var indexObj = storeObj.index(self.name);
        var getRequest = indexObj.get(key);
        getRequest.onsuccess = function(e) {
            self.processRecord(key, e.target.result, fn);
        };
    }, 'get ' + key + ' from ' + this.store.name + '.' + this.name);
    return this;
};

DB.Transaction = function(db, stores, transaction) {
    this.db = db;
    this.stores = stores;
    this.transaction = transaction;

    for (var i = 0; i < this.stores.length; i++) {
        this[this.stores[i]] = new DB.Store(this, this.stores[i]);
    }
};

DB.Transaction.prototype.processRecord = function(key, value, fn) {
    this.db.processRecord(key, value, fn);
};

DB.Transaction.prototype.read = function(stores, fn) {
    fn(this);
    return this;
};

function log(msg) {
    if (msg && loggingEnabled && this.console) {
        console.log(msg);
    }
}

return DB;

})(this);