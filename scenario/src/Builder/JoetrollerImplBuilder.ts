import { Event } from "../Event";
import { World } from "../World";
import { JoetrollerImpl } from "../Contract/JoetrollerImpl";
import { Invokation, invoke } from "../Invokation";
import { getStringV } from "../CoreValue";
import { StringV } from "../Value";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { storeAndSaveContract } from "../Networks";
import { getContract, getTestContract } from "../Contract";

const JoetrollerScenarioContract = getTestContract("JoetrollerScenario");
const JoetrollerContract = getContract("Joetroller");

const JoetrollerBorkedContract = getTestContract("JoetrollerBorked");

export interface JoetrollerImplData {
  invokation: Invokation<JoetrollerImpl>;
  name: string;
  contract: string;
  description: string;
}

export async function buildJoetrollerImpl(
  world: World,
  from: string,
  event: Event
): Promise<{
  world: World;
  joetrollerImpl: JoetrollerImpl;
  joetrollerImplData: JoetrollerImplData;
}> {
  const fetchers = [
    new Fetcher<{ name: StringV }, JoetrollerImplData>(
      `
        #### Scenario

        * "Scenario name:<String>" - The Joetroller Scenario for local testing
          * E.g. "JoetrollerImpl Deploy Scenario MyScen"
      `,
      "Scenario",
      [new Arg("name", getStringV)],
      async (world, { name }) => ({
        invokation: await JoetrollerScenarioContract.deploy<JoetrollerImpl>(
          world,
          from,
          []
        ),
        name: name.val,
        contract: "JoetrollerScenario",
        description: "Scenario Joetroller Impl",
      })
    ),

    new Fetcher<{ name: StringV }, JoetrollerImplData>(
      `
        #### Standard

        * "Standard name:<String>" - The standard Joetroller contract
          * E.g. "Joetroller Deploy Standard MyStandard"
      `,
      "Standard",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation: await JoetrollerContract.deploy<JoetrollerImpl>(
            world,
            from,
            []
          ),
          name: name.val,
          contract: "Joetroller",
          description: "Standard Joetroller Impl",
        };
      }
    ),

    new Fetcher<{ name: StringV }, JoetrollerImplData>(
      `
        #### Borked

        * "Borked name:<String>" - A Borked Joetroller for testing
          * E.g. "JoetrollerImpl Deploy Borked MyBork"
      `,
      "Borked",
      [new Arg("name", getStringV)],
      async (world, { name }) => ({
        invokation: await JoetrollerBorkedContract.deploy<JoetrollerImpl>(
          world,
          from,
          []
        ),
        name: name.val,
        contract: "JoetrollerBorked",
        description: "Borked Joetroller Impl",
      })
    ),
    new Fetcher<{ name: StringV }, JoetrollerImplData>(
      `
        #### Default

        * "name:<String>" - The standard Joetroller contract
          * E.g. "JoetrollerImpl Deploy MyDefault"
      `,
      "Default",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        if (world.isLocalNetwork()) {
          // Note: we're going to use the scenario contract as the standard deployment on local networks
          return {
            invokation: await JoetrollerScenarioContract.deploy<JoetrollerImpl>(
              world,
              from,
              []
            ),
            name: name.val,
            contract: "JoetrollerScenario",
            description: "Scenario Joetroller Impl",
          };
        } else {
          return {
            invokation: await JoetrollerContract.deploy<JoetrollerImpl>(
              world,
              from,
              []
            ),
            name: name.val,
            contract: "Joetroller",
            description: "Standard Joetroller Impl",
          };
        }
      },
      { catchall: true }
    ),
  ];

  let joetrollerImplData = await getFetcherValue<any, JoetrollerImplData>(
    "DeployJoetrollerImpl",
    fetchers,
    world,
    event
  );
  let invokation = joetrollerImplData.invokation;
  delete joetrollerImplData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const joetrollerImpl = invokation.value!;

  world = await storeAndSaveContract(
    world,
    joetrollerImpl,
    joetrollerImplData.name,
    invokation,
    [
      {
        index: ["Joetroller", joetrollerImplData.name],
        data: {
          address: joetrollerImpl._address,
          contract: joetrollerImplData.contract,
          description: joetrollerImplData.description,
        },
      },
    ]
  );

  return { world, joetrollerImpl, joetrollerImplData };
}
