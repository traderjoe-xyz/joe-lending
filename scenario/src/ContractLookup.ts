import { Map } from "immutable";

import { Event } from "./Event";
import { World } from "./World";
import { accountMap } from "./Accounts";
import { Contract } from "./Contract";
import { mustString } from "./Utils";

import { JErc20Delegate } from "./Contract/JErc20Delegate";
import { Joe } from "./Contract/Joe";
import { Joetroller } from "./Contract/Joetroller";
import { JoetrollerImpl } from "./Contract/JoetrollerImpl";
import { JToken } from "./Contract/JToken";
import { Erc20 } from "./Contract/Erc20";
import { InterestRateModel } from "./Contract/InterestRateModel";
import { PriceOracle } from "./Contract/PriceOracle";

type ContractDataEl = string | Map<string, object> | undefined;

function getContractData(world: World, indices: string[][]): ContractDataEl {
  return indices.reduce((value: ContractDataEl, index) => {
    if (value) {
      return value;
    } else {
      return index.reduce((data: ContractDataEl, el) => {
        let lowerEl = el.toLowerCase();

        if (!data) {
          return;
        } else if (typeof data === "string") {
          return data;
        } else {
          return (data as Map<string, ContractDataEl>).find(
            (_v, key) => key.toLowerCase().trim() === lowerEl.trim()
          );
        }
      }, world.contractData);
    }
  }, undefined);
}

function getContractDataString(world: World, indices: string[][]): string {
  const value: ContractDataEl = getContractData(world, indices);

  if (!value || typeof value !== "string") {
    throw new Error(
      `Failed to find string value by index (got ${value}): ${JSON.stringify(
        indices
      )}, index contains: ${JSON.stringify(world.contractData.toJSON())}`
    );
  }

  return value;
}

export function getWorldContract<T>(world: World, indices: string[][]): T {
  const address = getContractDataString(world, indices);

  return getWorldContractByAddress<T>(world, address);
}

export function getWorldContractByAddress<T>(world: World, address: string): T {
  const contract = world.contractIndex[address.toLowerCase()];

  if (!contract) {
    throw new Error(
      `Failed to find world contract by address: ${address}, index contains: ${JSON.stringify(
        Object.keys(world.contractIndex)
      )}`
    );
  }

  return <T>(<unknown>contract);
}

export async function getUnitroller(world: World): Promise<Joetroller> {
  return getWorldContract(world, [["Contracts", "Unitroller"]]);
}

export async function getJoetroller(world: World): Promise<Joetroller> {
  return getWorldContract(world, [["Contracts", "Joetroller"]]);
}

export async function getJoetrollerImpl(
  world: World,
  comptrollerImplArg: Event
): Promise<JoetrollerImpl> {
  return getWorldContract(world, [
    ["Joetroller", mustString(comptrollerImplArg), "address"],
  ]);
}

export function getJTokenAddress(world: World, jTokenArg: string): string {
  return getContractDataString(world, [["jTokens", jTokenArg, "address"]]);
}

export function getJTokenDelegateAddress(
  world: World,
  jTokenDelegateArg: string
): string {
  return getContractDataString(world, [
    ["JTokenDelegate", jTokenDelegateArg, "address"],
  ]);
}

export function getErc20Address(world: World, erc20Arg: string): string {
  return getContractDataString(world, [["Tokens", erc20Arg, "address"]]);
}

export async function getPriceOracleProxy(world: World): Promise<PriceOracle> {
  return getWorldContract(world, [["Contracts", "PriceOracleProxy"]]);
}

export async function getPriceOracle(world: World): Promise<PriceOracle> {
  return getWorldContract(world, [["Contracts", "PriceOracle"]]);
}

export async function getJoe(world: World, compArg: Event): Promise<Joe> {
  return getWorldContract(world, [["Joe", "address"]]);
}

export async function getJoeData(
  world: World,
  compArg: string
): Promise<[Joe, string, Map<string, string>]> {
  let contract = await getJoe(world, <Event>(<any>compArg));
  let data = getContractData(world, [["Joe", compArg]]);

  return [contract, compArg, <Map<string, string>>(<any>data)];
}

export async function getInterestRateModel(
  world: World,
  interestRateModelArg: Event
): Promise<InterestRateModel> {
  return getWorldContract(world, [
    ["InterestRateModel", mustString(interestRateModelArg), "address"],
  ]);
}

export async function getInterestRateModelData(
  world: World,
  interestRateModelArg: string
): Promise<[InterestRateModel, string, Map<string, string>]> {
  let contract = await getInterestRateModel(
    world,
    <Event>(<any>interestRateModelArg)
  );
  let data = getContractData(world, [
    ["InterestRateModel", interestRateModelArg],
  ]);

  return [contract, interestRateModelArg, <Map<string, string>>(<any>data)];
}

export async function getErc20Data(
  world: World,
  erc20Arg: string
): Promise<[Erc20, string, Map<string, string>]> {
  let contract = getWorldContract<Erc20>(world, [
    ["Tokens", erc20Arg, "address"],
  ]);
  let data = getContractData(world, [["Tokens", erc20Arg]]);

  return [contract, erc20Arg, <Map<string, string>>(<any>data)];
}

export async function getJTokenData(
  world: World,
  jTokenArg: string
): Promise<[JToken, string, Map<string, string>]> {
  let contract = getWorldContract<JToken>(world, [
    ["jTokens", jTokenArg, "address"],
  ]);
  let data = getContractData(world, [["JTokens", jTokenArg]]);

  return [contract, jTokenArg, <Map<string, string>>(<any>data)];
}

export async function getJTokenDelegateData(
  world: World,
  jTokenDelegateArg: string
): Promise<[JErc20Delegate, string, Map<string, string>]> {
  let contract = getWorldContract<JErc20Delegate>(world, [
    ["JTokenDelegate", jTokenDelegateArg, "address"],
  ]);
  let data = getContractData(world, [["JTokenDelegate", jTokenDelegateArg]]);

  return [contract, jTokenDelegateArg, <Map<string, string>>(<any>data)];
}

export async function getJoetrollerImplData(
  world: World,
  comptrollerImplArg: string
): Promise<[JoetrollerImpl, string, Map<string, string>]> {
  let contract = await getJoetrollerImpl(
    world,
    <Event>(<any>comptrollerImplArg)
  );
  let data = getContractData(world, [["Joetroller", comptrollerImplArg]]);

  return [contract, comptrollerImplArg, <Map<string, string>>(<any>data)];
}

export function getAddress(world: World, addressArg: string): string {
  if (addressArg.toLowerCase() === "zero") {
    return "0x0000000000000000000000000000000000000000";
  }

  if (addressArg.startsWith("0x")) {
    return addressArg;
  }

  let alias = Object.entries(world.settings.aliases).find(
    ([alias, addr]) => alias.toLowerCase() === addressArg.toLowerCase()
  );
  if (alias) {
    return alias[1];
  }

  let account = world.accounts.find(
    (account) => account.name.toLowerCase() === addressArg.toLowerCase()
  );
  if (account) {
    return account.address;
  }

  return getContractDataString(world, [
    ["Contracts", addressArg],
    ["jTokens", addressArg, "address"],
    ["JTokenDelegate", addressArg, "address"],
    ["Tokens", addressArg, "address"],
    ["Joetroller", addressArg, "address"],
  ]);
}

export function getContractByName(world: World, name: string): Contract {
  return getWorldContract(world, [["Contracts", name]]);
}
