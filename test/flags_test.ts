// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import * as chai from 'chai';

import Flags from '../src/flags';

const { expect } = chai;

describe('flags', () => {
  it('should extract unparsed arguments', () => {
    const flags = new Flags().addFlag('foo', 'Set foo');
    flags.parse(['node', 'foo.js', 'foo']);
    expect(flags.get('foo')).to.be.false;
    expect(flags.args).to.deep.equal(['foo']);
  });

  it('should parse a command-line flag', () => {
    const flags = new Flags().addFlag('foo', 'Set foo');
    flags.parse(['node', 'foo.js', '--foo']);
    expect(flags.get('foo')).to.be.true;
  });

  it('should parse a few command-line flag amid other arguments', () => {
    const flags = new Flags().addFlag('foo', 'Set foo').addFlag('bar', '');
    flags.parse(['node', 'foo.js', 'arg1', '--foo', '-37.15', '--bar']);
    expect(flags.get('foo')).to.be.true;
    expect(flags.get('bar')).to.be.true;
    expect(flags.args).to.deep.equal(['arg1', '-37.15']);
  });

  it('should throw on invalid flags', () => {
    const flags = new Flags();
    expect(() => flags.parse(['node', 'foo.js', '--foo'])).to.throw(/invalid flag --foo/);
  });
});
