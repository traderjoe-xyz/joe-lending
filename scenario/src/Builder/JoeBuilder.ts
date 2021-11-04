import { Event } from "../Event";
import { World, addAction } from "../World";
import { Joe, JoeScenario } from "../Contract/Joe";
import { Invokation } from "../Invokation";
import { getAddressV } from "../CoreValue";
import { StringV, AddressV } from "../Value";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { storeAndSaveContract } from "../Networks";
import { getContract } from "../Contract";

const JoeContract = getContract("Joe");
const JoeScenarioContract = getContract("JoeScenario");

export interface TokenData {
  invokation: Invokation<Joe>;
  contract: string;
  address?: string;
  symbol: string;
  name: string;
  decimals?: number;
}

export async function buildJoe(
  world: World,
  from: string,
  params: Event
): Promise<{ world: World; joe: Joe; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### Scenario

      * "Joe Deploy Scenario account:<Address>" - Deploys Scenario Joe Token
        * E.g. "Joe Deploy Scenario Geoff"
    `,
      "Scenario",
      [new Arg("account", getAddressV)],
      async (world, { account }) => {
        return {
          invokation: await JoeScenarioContract.deploy<JoeScenario>(
            world,
            from,
            [account.val]
          ),
          contract: "JoeScenario",
          symbol: "JOE",
          name: "Banker Joe Governance Token",
          decimals: 18,
        };
      }
    ),

    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### Joe

      * "Joe Deploy account:<Address>" - Deploys Joe Token
        * E.g. "Joe Deploy Geoff"
    `,
      "Joe",
      [new Arg("account", getAddressV)],
      async (world, { account }) => {
        if (world.isLocalNetwork()) {
          return {
            invokation: await JoeScenarioContract.deploy<JoeScenario>(
              world,
              from,
              [account.val]
            ),
            contract: "JoeScenario",
            symbol: "JOE",
            name: "Banker Joe Governance Token",
            decimals: 18,
          };
        } else {
          return {
            invokation: await JoeContract.deploy<Joe>(world, from, [
              account.val,
            ]),
            contract: "Joe",
            symbol: "JOE",
            name: "Banker Joe Governance Token",
            decimals: 18,
          };
        }
      },
      { catchall: true }
    ),
  ];

  let tokenData = await getFetcherValue<any, TokenData>(
    "DeployJoe",
    fetchers,
    world,
    params
  );
  let invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const joe = invokation.value!;
  tokenData.address = joe._address;

  world = await storeAndSaveContract(world, joe, "Joe", invokation, [
    { index: ["Joe"], data: tokenData },
    { index: ["Tokens", tokenData.symbol], data: tokenData },
  ]);

  tokenData.invokation = invokation;

  return { world, joe, tokenData };
}
