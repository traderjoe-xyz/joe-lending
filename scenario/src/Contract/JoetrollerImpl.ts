import { Contract } from "../Contract";
import { Sendable } from "../Invokation";
import { encodedNumber } from "../Encoding";

interface JoetrollerImplMethods {
  _become(joetroller: string): Sendable<string>;
}

export interface JoetrollerImpl extends Contract {
  methods: JoetrollerImplMethods;
}
