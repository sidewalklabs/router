// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import * as _ from 'lodash';

/**
 * Command line flag parser.
 *
 * For now:
 * - all flags are optional
 * - flags may be specified anywhere in the command line
 * - flags only have long forms (--long-name)
 * - flags are booleans which default to false.
 * - flags don't have values (i.e. no --flag=value).
 */
class Flags {
  flags: {[name: string]: string};  // flag name --> description
  isParsed: boolean;
  flagValues: {[name: string]: boolean};
  unparsedArgs: string[];  // unparsed arguments.
  appVersion: string;
  appDescription: string;

  constructor() {
    this.isParsed = false;
    this.flags = {};
  }

  /** Register a new flag. */
  addFlag(name: string, description: string) {
    if (name in this.flags) {
      throw new Error(`Added flag ${name} twice.`);
    }
    this.flags[name] = description;
    return this;
  }

  version(version: string) {
    this.appVersion = version;
    return this;
  }

  description(description: string) {
    this.appDescription = description;
    return this;
  }

  /** Parse command line arguments. */
  parse(fullArgs: string[]) {
    if (this.isParsed) {
      throw new Error('Tried to parse arguments twice.');
    }
    const args = fullArgs.slice(2);  // remove ['node', 'program.js']

    // Take care of a few special cases: -h / --help, -v / --version
    if (args[0] === '-h' || args[0] === '--help') {
      this.usage();
      process.exit(0);
    }
    if (args[0] === '-v' || args[0] === '--version') {
      console.log(this.appVersion);
      process.exit(0);
    }

    this.flagValues = {};
    this.unparsedArgs = [];
    for (const arg of args) {
      if (arg.slice(0, 2) === '--') {
        this.parseFlag(arg.slice(2));
      } else {
        this.unparsedArgs.push(arg);
      }
    }

    this.isParsed = true;
  }

  /** Prints a usage string to stdout. */
  usage() {
    console.log(this.appDescription);
    console.log('\nOptions:\n');
    const flags = _.sortBy(_.keys(this.flags));
    console.log('    -h, --help     output usage information');
    console.log('    -V, --version  output the version number');
    for (const flag of flags) {
      // TODO(danvk): pad ${flag} to be a consistent width.
      console.log(`    --${flag}      ${this.flags[flag]}`);
    }
  }

  private parseFlag(flag: string) {
    if (flag in this.flags) {
      this.flagValues[flag] = true;
    } else {
      throw new Error(`Found invalid flag --${flag}`);
    }
  }

  /** Get the value of a command-line flag. */
  get(arg: string): boolean {
    if (!this.isParsed) {
      throw new Error(`Tried to get value of flag ${arg} before argument parsing.`);
    }
    return this.flagValues[arg] || false;
  }

  get args(): string[] {
    return this.unparsedArgs;
  }
}

export default Flags;
