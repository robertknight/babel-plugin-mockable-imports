import { stub } from 'sinon'
import { assert } from 'chai';

import { runApp, $imports } from '../src/app'

describe('runApp', () => {
  afterEach(() => {
    $imports.$restore();
  });

  it('should print a log message', () => {
    const fakeLog = stub();

    $imports.$mock({
      './logger': {
        log: fakeLog,
      },
    });

    runApp();

    assert.isTrue(fakeLog.calledWith('app is starting'));
  });
});
