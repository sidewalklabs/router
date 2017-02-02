// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
declare namespace Chai {
  export interface Assertion {
    roughly: RoughAssertion;
  }

  interface RoughAssertion extends Assertion {
    (tolerance: number): Assertion;
  }
}
