import { Event } from "../Event";
import { World } from "../World";
import {
  JErc20Delegate,
  JErc20DelegateScenario,
} from "../Contract/JErc20Delegate";
import { Invokation } from "../Invokation";
import { getStringV } from "../CoreValue";
import { StringV } from "../Value";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { storeAndSaveContract } from "../Networks";
import { getContract, getTestContract } from "../Contract";

const JErc20DelegateContract = getContract("JErc20Delegate");
const JErc20DelegateScenarioContract = getTestContract(
  "JErc20DelegateScenario"
);
const JCapableErc20DelegateContract = getContract("JCapableErc20Delegate");
const JCollateralCapErc20DelegateScenarioContract = getContract(
  "JCollateralCapErc20DelegateScenario"
);
const JWrappedNativeDelegateScenarioContract = getContract(
  "JWrappedNativeDelegateScenario"
);

export interface JTokenDelegateData {
  invokation: Invokation<JErc20Delegate>;
  name: string;
  contract: string;
  description?: string;
}

export async function buildJTokenDelegate(
  world: World,
  from: string,
  params: Event
): Promise<{
  world: World;
  jTokenDelegate: JErc20Delegate;
  delegateData: JTokenDelegateData;
}> {
  const fetchers = [
    new Fetcher<{ name: StringV }, JTokenDelegateData>(
      `
        #### JErc20Delegate

        * "JErc20Delegate name:<String>"
          * E.g. "JTokenDelegate Deploy JErc20Delegate cDAIDelegate"
      `,
      "JErc20Delegate",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation: await JErc20DelegateContract.deploy<JErc20Delegate>(
            world,
            from,
            []
          ),
          name: name.val,
          contract: "JErc20Delegate",
          description: "Standard JErc20 Delegate",
        };
      }
    ),

    new Fetcher<{ name: StringV }, JTokenDelegateData>(
      `
        #### JErc20DelegateScenario

        * "JErc20DelegateScenario name:<String>" - A JErc20Delegate Scenario for local testing
          * E.g. "JTokenDelegate Deploy JErc20DelegateScenario cDAIDelegate"
      `,
      "JErc20DelegateScenario",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation:
            await JErc20DelegateScenarioContract.deploy<JErc20DelegateScenario>(
              world,
              from,
              []
            ),
          name: name.val,
          contract: "JErc20DelegateScenario",
          description: "Scenario JErc20 Delegate",
        };
      }
    ),

    new Fetcher<{ name: StringV }, JTokenDelegateData>(
      `
        #### JCapableErc20Delegate
        * "JCapableErc20Delegate name:<String>"
          * E.g. "JTokenDelegate Deploy JCapableErc20Delegate cLinkDelegate"
      `,
      "JCapableErc20Delegate",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation:
            await JCapableErc20DelegateContract.deploy<JErc20Delegate>(
              world,
              from,
              []
            ),
          name: name.val,
          contract: "JCapableErc20Delegate",
          description: "Capable JErc20 Delegate",
        };
      }
    ),

    new Fetcher<{ name: StringV }, JTokenDelegateData>(
      `
        #### JCollateralCapErc20DelegateScenario
        * "JCollateralCapErc20DelegateScenario name:<String>"
          * E.g. "JTokenDelegate Deploy JCollateralCapErc20DelegateScenario cLinkDelegate"
      `,
      "JCollateralCapErc20DelegateScenario",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation:
            await JCollateralCapErc20DelegateScenarioContract.deploy<JErc20Delegate>(
              world,
              from,
              []
            ),
          name: name.val,
          contract: "JCollateralCapErc20DelegateScenario",
          description: "Collateral Cap JErc20 Delegate",
        };
      }
    ),

    new Fetcher<{ name: StringV }, JTokenDelegateData>(
      `
        #### JWrappedNativeDelegateScenario
        * "JWrappedNativeDelegateScenario name:<String>"
          * E.g. "JTokenDelegate Deploy JWrappedNativeDelegateScenario cLinkDelegate"
      `,
      "JWrappedNativeDelegateScenario",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation:
            await JWrappedNativeDelegateScenarioContract.deploy<JErc20Delegate>(
              world,
              from,
              []
            ),
          name: name.val,
          contract: "JWrappedNativeDelegateScenario",
          description: "Wrapped Native JErc20 Delegate",
        };
      }
    ),
  ];

  let delegateData = await getFetcherValue<any, JTokenDelegateData>(
    "DeployJToken",
    fetchers,
    world,
    params
  );
  let invokation = delegateData.invokation;
  delete delegateData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const jTokenDelegate = invokation.value!;

  world = await storeAndSaveContract(
    world,
    jTokenDelegate,
    delegateData.name,
    invokation,
    [
      {
        index: ["JTokenDelegate", delegateData.name],
        data: {
          address: jTokenDelegate._address,
          contract: delegateData.contract,
          description: delegateData.description,
        },
      },
    ]
  );

  return { world, jTokenDelegate, delegateData };
}
