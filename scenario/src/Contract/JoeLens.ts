import { Contract } from "../Contract";
import { Sendable } from "../Invokation";

export interface JoeLensMethods {
  jTokenBalances(
    jToken: string,
    account: string
  ): Sendable<[string, number, number, number, number, number]>;
  jTokenBalancesAll(
    jTokens: string[],
    account: string
  ): Sendable<[string, number, number, number, number, number][]>;
  jTokenMetadata(
    jToken: string
  ): Sendable<
    [
      string,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      boolean,
      number,
      string,
      number,
      number
    ]
  >;
  jTokenMetadataAll(
    jTokens: string[]
  ): Sendable<
    [
      string,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      boolean,
      number,
      string,
      number,
      number
    ][]
  >;
  getAccountLimits(
    comptroller: string,
    account: string
  ): Sendable<[string[], number, number]>;
}

export interface JoeLens extends Contract {
  methods: JoeLensMethods;
  name: string;
}
