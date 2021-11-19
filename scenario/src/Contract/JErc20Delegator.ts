import { Contract } from "../Contract";
import { Callable, Sendable } from "../Invokation";
import { JTokenMethods } from "./JToken";
import { encodedNumber } from "../Encoding";

interface JErc20DelegatorMethods extends JTokenMethods {
  implementation(): Callable<string>;
  _setImplementation(
    implementation_: string,
    allowResign: boolean,
    becomImplementationData: string
  ): Sendable<void>;
}

interface JErc20DelegatorScenarioMethods extends JErc20DelegatorMethods {
  setTotalBorrows(amount: encodedNumber): Sendable<void>;
  setTotalReserves(amount: encodedNumber): Sendable<void>;
}

export interface JErc20Delegator extends Contract {
  methods: JErc20DelegatorMethods;
  name: string;
}

export interface JErc20DelegatorScenario extends Contract {
  methods: JErc20DelegatorMethods;
  name: string;
}

export interface JCollateralCapErc20DelegatorScenario extends Contract {
  methods: JErc20DelegatorMethods;
  name: string;
}

export interface JWrappedNativeDelegatorScenario extends Contract {
  methods: JErc20DelegatorMethods;
  name: string;
}
