describe('DB', function() {

    beforeEach(function() {
        this.timeout(5000);
        new DB('PeopleDB').delete();
    });

    it('makes using indexedDB easy!', function(done) {
        var db = new DB('PeopleDB', {
            version: 1,
            stores: {
                people: {
                    keyPath: 'id',
                    indexes: {
                        byState: {
                            keyPath: 'state'
                        }
                    }
                }
            }
        });

        db.people.put({
            id: 1,
            name: 'Jason',
            state: 'CA'
        });

        db.people.put({
            id: 2,
            name: 'Brock',
            state: 'RI'
        });

        db.people.get(1, function(person) {
            expect(person.value.name).to.equal('Jason');
        });

        db.people.byState.get('CA', function(person) {
            expect(person.value.name).to.equal('Jason');

            done();
        });
    });

    it('supports method chaining', function(done) {
        new DB('PeopleDB', {
            version: 1,
            stores: {
                people: {
                    keyPath: 'id',
                    indexes: {
                        byState: {
                            keyPath: 'state'
                        }
                    }
                }
            }
        })
        .people.put({
            id: 1,
            name: 'Jason',
            state: 'CA'
        })
        .people.put({
            id: 2,
            name: 'Brock',
            state: 'RI'
        })
        .people.get(1, function(person) {
            expect(person.value.name).to.equal('Jason');
        })
        .people.byState.get('CA', function(person) {
            expect(person.value.name).to.equal('Jason');

            done();
        });
    });

    describe('DB.Store', function() {
        describe('.get()', function() {
            it('gets the record matching the key that is passed in', function(done) {
                new DB('PeopleDB', {
                    version: 1,
                    stores: {
                        people: {}
                    }
                })
                .thenLog('before')
                .people.put({ name: 'Jason' }, 1)
                .thenLog('after')
                .people.get(1, function(record) {
                    expect(record.value.name).to.equal('Jason');
                    done();
                })
                .thenLog('end of test');
            });

            it('logs the record to the console if no handler was passed to .get()', function(done) {
                sinon.spy(console, 'log');
                new DB('PeopleDB', {
                    version: 1,
                    stores: {
                        people: {}
                    }
                })
                .people.put({ name: 'Jason' }, 1)
                .people.get(1)
                .then(function() {
                    expect(console.log.calledWith({ key: 1, value: { name: 'Jason' } })).to.be.true;
                    console.log.restore();
                    done();
                });
            });
        });

        describe('.getAll()', function() {
            it('gets all records when no keys are passed in', function(done) {
                var records = [];
                new DB('PeopleDB', {
                    version: 1,
                    stores: {
                        people: {}
                    }
                })
                .people.put({ name: 'Jason' }, 1)
                .people.put({ name: 'Brock' }, 2)
                .people.getAll(function(person) {
                    records.push(person);
                })
                .then(function() {
                    expect(records.length).to.equal(2);
                    expect(records[0].value.name).to.equal('Jason');
                    expect(records[1].value.name).to.equal('Brock');

                    done();
                });
            });

            it('gets each record matching the keys that are passed in');
            it('gets each record matching the key range that is passed in');
            it('gets each record matching the key ranges that are passed in');
            it('passes the records to a built-in method that logs it to the console if there is no callback');
        });

        describe('.put()', function() {
            it('accepts an optional key as the 2nd argument', function(done) {
                new DB('PeopleDB', {
                    version: 1,
                    stores: {
                        people: {}
                    }
                })
                .people.put({ name: 'Jason' }, 1)
                .people.put({ name: 'Brock' }, 2)
                .people.get(1, function(record) {
                    expect(record.value.name).to.equal('Jason');
                })
                .people.get(2, function(record) {
                    expect(record.value.name).to.equal('Brock');
                    done();
                });
            });
        });
    });

    describe('DB.Index', function() {
        describe('.get()', function() { });
        describe('.getAll()', function() { });
    });

    describe('DB.Transaction', function() {
        describe('.read()', function() {
            it('allows multiple reads on the same transaction', function(done) {
                new DB('PeopleDB', {
                    version: 1,
                    stores: {
                        people: {
                            keyPath: 'id'
                        }
                    }
                })
                .on('error', function(e) {
                    done(e);
                })
                .people.put({
                    id: 1,
                    name: 'Jason',
                    state: 'CA'
                })
                .people.put({
                    id: 2,
                    name: 'Brock',
                    state: 'RI'
                })
                .read('people', function(tx) {
                    var person1, person2;
                    tx.people.get(1, function(record) {
                        person1 = record;
                        check();
                    }).people.get(2, function(record) {
                        person2 = record;
                        check();
                    });
                    // This is too low-level.
                    // Where's the error handling?
                    function check() {
                        if (person1 && person2) {
                            expect(person1.value.name).to.equal('Jason');
                            expect(person2.value.name).to.equal('Brock');
                            done();
                        }
                    }
                });
            });
        });

        describe('.readWrite()', function() { });
    });

});