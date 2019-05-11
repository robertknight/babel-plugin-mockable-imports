import { stub } from 'sinon'
import { assert } from 'chai';

import * as app from '../src/app';
import { getImports } from './mock';

const { runApp } = app;
const $imports = getImports(app);

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
