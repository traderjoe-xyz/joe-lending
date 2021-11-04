import { Contract } from '../Contract';
import { Sendable } from '../Invokation';
import { JTokenMethods, JTokenScenarioMethods } from './JToken';

interface JErc20DelegateMethods extends JTokenMethods {
  _becomeImplementation(data: string): Sendable<void>;
  _resignImplementation(): Sendable<void>;
}

interface JErc20DelegateScenarioMethods extends JTokenScenarioMethods {
  _becomeImplementation(data: string): Sendable<void>;
  _resignImplementation(): Sendable<void>;
}

export interface JErc20Delegate extends Contract {
  methods: JErc20DelegateMethods;
  name: string;
}

export interface JErc20DelegateScenario extends Contract {
  methods: JErc20DelegateScenarioMethods;
  name: string;
}
