import { Event } from "../Event";
import { World } from "../World";
import {
  JErc20Delegator,
  JErc20DelegatorScenario,
  JCollateralCapErc20DelegatorScenario,
  JWrappedNativeDelegatorScenario,
} from "../Contract/JErc20Delegator";
import { JToken } from "../Contract/JToken";
import { Invokation, invoke } from "../Invokation";
import {
  getAddressV,
  getExpNumberV,
  getNumberV,
  getStringV,
} from "../CoreValue";
import { AddressV, NumberV, StringV } from "../Value";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { storeAndSaveContract } from "../Networks";
import { getContract, getTestContract } from "../Contract";

const JErc20Contract = getContract("JErc20Immutable");
const JErc20Delegator = getContract("JErc20Delegator");
const JErc20DelegatorScenario = getTestContract("JErc20DelegatorScenario");
const JCollateralCapErc20DelegatorScenario = getContract(
  "JCollateralCapErc20DelegatorScenario"
);
const JWrappedNativeDelegatorScenario = getContract(
  "JWrappedNativeDelegatorScenario"
);
const JAvaxContract = getContract("JAvax");
const JErc20ScenarioContract = getTestContract("JErc20Scenario");
const JAvaxScenarioContract = getTestContract("JAvaxScenario");
const JEvilContract = getTestContract("JEvil");

export interface TokenData {
  invokation: Invokation<JToken>;
  name: string;
  symbol: string;
  decimals?: number;
  underlying?: string;
  address?: string;
  contract: string;
  initial_exchange_rate_mantissa?: string;
  admin?: string;
}

export async function buildJToken(
  world: World,
  from: string,
  params: Event
): Promise<{ world: World; jToken: JToken; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<
      {
        symbol: StringV;
        name: StringV;
        decimals: NumberV;
        underlying: AddressV;
        joetroller: AddressV;
        interestRateModel: AddressV;
        initialExchangeRate: NumberV;
        admin: AddressV;
        implementation: AddressV;
        becomeImplementationData: StringV;
      },
      TokenData
    >(
      `
      #### JErc20Delegator

      * "JErc20Delegator symbol:<String> name:<String> underlying:<Address> joetroller:<Address> interestRateModel:<Address> initialExchangeRate:<Number> decimals:<Number> admin: <Address> implementation:<Address> becomeImplementationData:<String>" - The real deal JToken
        * E.g. "JToken Deploy JErc20Delegator cDAI \"Banker Joe DAI\" (Erc20 DAI Address) (Joetroller Address) (InterestRateModel Address) 1.0 8 Geoff (JToken CDaiDelegate Address) "0x0123434anyByTes314535q" "
    `,
      "JErc20Delegator",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("underlying", getAddressV),
        new Arg("joetroller", getAddressV),
        new Arg("interestRateModel", getAddressV),
        new Arg("initialExchangeRate", getExpNumberV),
        new Arg("decimals", getNumberV),
        new Arg("admin", getAddressV),
        new Arg("implementation", getAddressV),
        new Arg("becomeImplementationData", getStringV),
      ],
      async (
        world,
        {
          symbol,
          name,
          underlying,
          joetroller,
          interestRateModel,
          initialExchangeRate,
          decimals,
          admin,
          implementation,
          becomeImplementationData,
        }
      ) => {
        return {
          invokation: await JErc20Delegator.deploy<JErc20Delegator>(
            world,
            from,
            [
              underlying.val,
              joetroller.val,
              interestRateModel.val,
              initialExchangeRate.val,
              name.val,
              symbol.val,
              decimals.val,
              admin.val,
              implementation.val,
              becomeImplementationData.val,
            ]
          ),
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          underlying: underlying.val,
          contract: "JErc20Delegator",
          initial_exchange_rate_mantissa: initialExchangeRate
            .encode()
            .toString(),
          admin: admin.val,
        };
      }
    ),

    new Fetcher<
      {
        symbol: StringV;
        name: StringV;
        decimals: NumberV;
        underlying: AddressV;
        joetroller: AddressV;
        interestRateModel: AddressV;
        initialExchangeRate: NumberV;
        admin: AddressV;
        implementation: AddressV;
        becomeImplementationData: StringV;
      },
      TokenData
    >(
      `
      #### JErc20DelegatorScenario

      * "JErc20DelegatorScenario symbol:<String> name:<String> underlying:<Address> joetroller:<Address> interestRateModel:<Address> initialExchangeRate:<Number> decimals:<Number> admin: <Address> implementation:<Address> becomeImplementationData:<String>" - A JToken Scenario for local testing
        * E.g. "JToken Deploy JErc20DelegatorScenario cDAI \"Banker Joe DAI\" (Erc20 DAI Address) (Joetroller Address) (InterestRateModel Address) 1.0 8 Geoff (JToken CDaiDelegate Address) "0x0123434anyByTes314535q" "
    `,
      "JErc20DelegatorScenario",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("underlying", getAddressV),
        new Arg("joetroller", getAddressV),
        new Arg("interestRateModel", getAddressV),
        new Arg("initialExchangeRate", getExpNumberV),
        new Arg("decimals", getNumberV),
        new Arg("admin", getAddressV),
        new Arg("implementation", getAddressV),
        new Arg("becomeImplementationData", getStringV),
      ],
      async (
        world,
        {
          symbol,
          name,
          underlying,
          joetroller,
          interestRateModel,
          initialExchangeRate,
          decimals,
          admin,
          implementation,
          becomeImplementationData,
        }
      ) => {
        return {
          invokation:
            await JErc20DelegatorScenario.deploy<JErc20DelegatorScenario>(
              world,
              from,
              [
                underlying.val,
                joetroller.val,
                interestRateModel.val,
                initialExchangeRate.val,
                name.val,
                symbol.val,
                decimals.val,
                admin.val,
                implementation.val,
                becomeImplementationData.val,
              ]
            ),
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          underlying: underlying.val,
          contract: "JErc20DelegatorScenario",
          initial_exchange_rate_mantissa: initialExchangeRate
            .encode()
            .toString(),
          admin: admin.val,
        };
      }
    ),

    new Fetcher<
      {
        symbol: StringV;
        name: StringV;
        decimals: NumberV;
        underlying: AddressV;
        joetroller: AddressV;
        interestRateModel: AddressV;
        initialExchangeRate: NumberV;
        admin: AddressV;
        implementation: AddressV;
        becomeImplementationData: StringV;
      },
      TokenData
    >(
      `
      #### JCollateralCapErc20DelegatorScenario

      * "JCollateralCapErc20DelegatorScenario symbol:<String> name:<String> underlying:<Address> joetroller:<Address> interestRateModel:<Address> initialExchangeRate:<Number> decimals:<Number> admin: <Address> implementation:<Address> becomeImplementationData:<String>" - A JToken Scenario for local testing
        * E.g. "JToken Deploy JCollateralCapErc20DelegatorScenario cDAI \"Banker Joe DAI\" (Erc20 DAI Address) (Joetroller Address) (InterestRateModel Address) 1.0 8 Geoff (JToken CDaiDelegate Address) "0x0123434anyByTes314535q" "
    `,
      "JCollateralCapErc20DelegatorScenario",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("underlying", getAddressV),
        new Arg("joetroller", getAddressV),
        new Arg("interestRateModel", getAddressV),
        new Arg("initialExchangeRate", getExpNumberV),
        new Arg("decimals", getNumberV),
        new Arg("admin", getAddressV),
        new Arg("implementation", getAddressV),
        new Arg("becomeImplementationData", getStringV),
      ],
      async (
        world,
        {
          symbol,
          name,
          underlying,
          joetroller,
          interestRateModel,
          initialExchangeRate,
          decimals,
          admin,
          implementation,
          becomeImplementationData,
        }
      ) => {
        return {
          invokation:
            await JCollateralCapErc20DelegatorScenario.deploy<JCollateralCapErc20DelegatorScenario>(
              world,
              from,
              [
                underlying.val,
                joetroller.val,
                interestRateModel.val,
                initialExchangeRate.val,
                name.val,
                symbol.val,
                decimals.val,
                admin.val,
                implementation.val,
                becomeImplementationData.val,
              ]
            ),
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          underlying: underlying.val,
          contract: "JCollateralCapErc20DelegatorScenario",
          initial_exchange_rate_mantissa: initialExchangeRate
            .encode()
            .toString(),
          admin: admin.val,
        };
      }
    ),

    new Fetcher<
      {
        symbol: StringV;
        name: StringV;
        decimals: NumberV;
        underlying: AddressV;
        joetroller: AddressV;
        interestRateModel: AddressV;
        initialExchangeRate: NumberV;
        admin: AddressV;
        implementation: AddressV;
        becomeImplementationData: StringV;
      },
      TokenData
    >(
      `
      #### JWrappedNativeDelegatorScenario

      * "JWrappedNativeDelegatorScenario symbol:<String> name:<String> underlying:<Address> joetroller:<Address> interestRateModel:<Address> initialExchangeRate:<Number> decimals:<Number> admin: <Address> implementation:<Address> becomeImplementationData:<String>" - A JToken Scenario for local testing
        * E.g. "JToken Deploy JWrappedNativeDelegatorScenario cDAI \"Banker Joe DAI\" (Erc20 DAI Address) (Joetroller Address) (InterestRateModel Address) 1.0 8 Geoff (JToken CDaiDelegate Address) "0x0123434anyByTes314535q" "
    `,
      "JWrappedNativeDelegatorScenario",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("underlying", getAddressV),
        new Arg("joetroller", getAddressV),
        new Arg("interestRateModel", getAddressV),
        new Arg("initialExchangeRate", getExpNumberV),
        new Arg("decimals", getNumberV),
        new Arg("admin", getAddressV),
        new Arg("implementation", getAddressV),
        new Arg("becomeImplementationData", getStringV),
      ],
      async (
        world,
        {
          symbol,
          name,
          underlying,
          joetroller,
          interestRateModel,
          initialExchangeRate,
          decimals,
          admin,
          implementation,
          becomeImplementationData,
        }
      ) => {
        return {
          invokation:
            await JWrappedNativeDelegatorScenario.deploy<JWrappedNativeDelegatorScenario>(
              world,
              from,
              [
                underlying.val,
                joetroller.val,
                interestRateModel.val,
                initialExchangeRate.val,
                name.val,
                symbol.val,
                decimals.val,
                admin.val,
                implementation.val,
                becomeImplementationData.val,
              ]
            ),
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          underlying: underlying.val,
          contract: "JWrappedNativeDelegatorScenario",
          initial_exchange_rate_mantissa: initialExchangeRate
            .encode()
            .toString(),
          admin: admin.val,
        };
      }
    ),

    new Fetcher<
      {
        symbol: StringV;
        name: StringV;
        decimals: NumberV;
        underlying: AddressV;
        joetroller: AddressV;
        interestRateModel: AddressV;
        initialExchangeRate: NumberV;
        admin: AddressV;
      },
      TokenData
    >(
      `
        #### Scenario

        * "Scenario symbol:<String> name:<String> underlying:<Address> joetroller:<Address> interestRateModel:<Address> initialExchangeRate:<Number> decimals:<Number> admin: <Address>" - A JToken Scenario for local testing
          * E.g. "JToken Deploy Scenario cZRX \"Banker Joe ZRX\" (Erc20 ZRX Address) (Joetroller Address) (InterestRateModel Address) 1.0 8"
      `,
      "Scenario",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("underlying", getAddressV),
        new Arg("joetroller", getAddressV),
        new Arg("interestRateModel", getAddressV),
        new Arg("initialExchangeRate", getExpNumberV),
        new Arg("decimals", getNumberV),
        new Arg("admin", getAddressV),
      ],
      async (
        world,
        {
          symbol,
          name,
          underlying,
          joetroller,
          interestRateModel,
          initialExchangeRate,
          decimals,
          admin,
        }
      ) => {
        return {
          invokation: await JErc20ScenarioContract.deploy<JToken>(world, from, [
            underlying.val,
            joetroller.val,
            interestRateModel.val,
            initialExchangeRate.val,
            name.val,
            symbol.val,
            decimals.val,
            admin.val,
          ]),
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          underlying: underlying.val,
          contract: "JErc20Scenario",
          initial_exchange_rate_mantissa: initialExchangeRate
            .encode()
            .toString(),
          admin: admin.val,
        };
      }
    ),

    new Fetcher<
      {
        symbol: StringV;
        name: StringV;
        decimals: NumberV;
        admin: AddressV;
        joetroller: AddressV;
        interestRateModel: AddressV;
        initialExchangeRate: NumberV;
      },
      TokenData
    >(
      `
        #### JAvaxScenario

        * "JAvaxScenario symbol:<String> name:<String> joetroller:<Address> interestRateModel:<Address> initialExchangeRate:<Number> decimals:<Number> admin: <Address>" - A JToken Scenario for local testing
          * E.g. "JToken Deploy JAvaxScenario cETH \"Banker Joe Ether\" (Joetroller Address) (InterestRateModel Address) 1.0 8"
      `,
      "JAvaxScenario",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("joetroller", getAddressV),
        new Arg("interestRateModel", getAddressV),
        new Arg("initialExchangeRate", getExpNumberV),
        new Arg("decimals", getNumberV),
        new Arg("admin", getAddressV),
      ],
      async (
        world,
        {
          symbol,
          name,
          joetroller,
          interestRateModel,
          initialExchangeRate,
          decimals,
          admin,
        }
      ) => {
        return {
          invokation: await JAvaxScenarioContract.deploy<JToken>(world, from, [
            name.val,
            symbol.val,
            decimals.val,
            admin.val,
            joetroller.val,
            interestRateModel.val,
            initialExchangeRate.val,
          ]),
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          underlying: "",
          contract: "JAvaxScenario",
          initial_exchange_rate_mantissa: initialExchangeRate
            .encode()
            .toString(),
          admin: admin.val,
        };
      }
    ),

    new Fetcher<
      {
        symbol: StringV;
        name: StringV;
        decimals: NumberV;
        admin: AddressV;
        joetroller: AddressV;
        interestRateModel: AddressV;
        initialExchangeRate: NumberV;
      },
      TokenData
    >(
      `
        #### JAvax

        * "JAvax symbol:<String> name:<String> joetroller:<Address> interestRateModel:<Address> initialExchangeRate:<Number> decimals:<Number> admin: <Address>" - A JToken Scenario for local testing
          * E.g. "JToken Deploy JAvax cETH \"Banker Joe Ether\" (Joetroller Address) (InterestRateModel Address) 1.0 8"
      `,
      "JAvax",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("joetroller", getAddressV),
        new Arg("interestRateModel", getAddressV),
        new Arg("initialExchangeRate", getExpNumberV),
        new Arg("decimals", getNumberV),
        new Arg("admin", getAddressV),
      ],
      async (
        world,
        {
          symbol,
          name,
          joetroller,
          interestRateModel,
          initialExchangeRate,
          decimals,
          admin,
        }
      ) => {
        return {
          invokation: await JAvaxContract.deploy<JToken>(world, from, [
            joetroller.val,
            interestRateModel.val,
            initialExchangeRate.val,
            name.val,
            symbol.val,
            decimals.val,
            admin.val,
          ]),
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          underlying: "",
          contract: "JAvax",
          initial_exchange_rate_mantissa: initialExchangeRate
            .encode()
            .toString(),
          admin: admin.val,
        };
      }
    ),

    new Fetcher<
      {
        symbol: StringV;
        name: StringV;
        decimals: NumberV;
        admin: AddressV;
        underlying: AddressV;
        joetroller: AddressV;
        interestRateModel: AddressV;
        initialExchangeRate: NumberV;
      },
      TokenData
    >(
      `
        #### JErc20

        * "JErc20 symbol:<String> name:<String> underlying:<Address> joetroller:<Address> interestRateModel:<Address> initialExchangeRate:<Number> decimals:<Number> admin: <Address>" - A official JToken contract
          * E.g. "JToken Deploy JErc20 cZRX \"Banker Joe ZRX\" (Erc20 ZRX Address) (Joetroller Address) (InterestRateModel Address) 1.0 8"
      `,
      "JErc20",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("underlying", getAddressV),
        new Arg("joetroller", getAddressV),
        new Arg("interestRateModel", getAddressV),
        new Arg("initialExchangeRate", getExpNumberV),
        new Arg("decimals", getNumberV),
        new Arg("admin", getAddressV),
      ],
      async (
        world,
        {
          symbol,
          name,
          underlying,
          joetroller,
          interestRateModel,
          initialExchangeRate,
          decimals,
          admin,
        }
      ) => {
        return {
          invokation: await JErc20Contract.deploy<JToken>(world, from, [
            underlying.val,
            joetroller.val,
            interestRateModel.val,
            initialExchangeRate.val,
            name.val,
            symbol.val,
            decimals.val,
            admin.val,
          ]),
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          underlying: underlying.val,
          contract: "JErc20",
          initial_exchange_rate_mantissa: initialExchangeRate
            .encode()
            .toString(),
          admin: admin.val,
        };
      }
    ),

    new Fetcher<
      {
        symbol: StringV;
        name: StringV;
        decimals: NumberV;
        admin: AddressV;
        underlying: AddressV;
        joetroller: AddressV;
        interestRateModel: AddressV;
        initialExchangeRate: NumberV;
      },
      TokenData
    >(
      `
        #### JEvil

        * "JEvil symbol:<String> name:<String> underlying:<Address> joetroller:<Address> interestRateModel:<Address> initialExchangeRate:<Number> decimals:<Number> admin: <Address>" - A malicious JToken contract
          * E.g. "JToken Deploy JEvil cEVL \"Banker Joe EVL\" (Erc20 ZRX Address) (Joetroller Address) (InterestRateModel Address) 1.0 8"
      `,
      "JEvil",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("underlying", getAddressV),
        new Arg("joetroller", getAddressV),
        new Arg("interestRateModel", getAddressV),
        new Arg("initialExchangeRate", getExpNumberV),
        new Arg("decimals", getNumberV),
        new Arg("admin", getAddressV),
      ],
      async (
        world,
        {
          symbol,
          name,
          underlying,
          joetroller,
          interestRateModel,
          initialExchangeRate,
          decimals,
          admin,
        }
      ) => {
        return {
          invokation: await JEvilContract.deploy<JToken>(world, from, [
            underlying.val,
            joetroller.val,
            interestRateModel.val,
            initialExchangeRate.val,
            name.val,
            symbol.val,
            decimals.val,
            admin.val,
          ]),
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          underlying: underlying.val,
          contract: "JEvil",
          initial_exchange_rate_mantissa: initialExchangeRate
            .encode()
            .toString(),
          admin: admin.val,
        };
      }
    ),

    new Fetcher<
      {
        symbol: StringV;
        name: StringV;
        decimals: NumberV;
        admin: AddressV;
        underlying: AddressV;
        joetroller: AddressV;
        interestRateModel: AddressV;
        initialExchangeRate: NumberV;
      },
      TokenData
    >(
      `
        #### Standard

        * "symbol:<String> name:<String> underlying:<Address> joetroller:<Address> interestRateModel:<Address> initialExchangeRate:<Number> decimals:<Number> admin: <Address>" - A official JToken contract
          * E.g. "JToken Deploy Standard cZRX \"Banker Joe ZRX\" (Erc20 ZRX Address) (Joetroller Address) (InterestRateModel Address) 1.0 8"
      `,
      "Standard",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("underlying", getAddressV),
        new Arg("joetroller", getAddressV),
        new Arg("interestRateModel", getAddressV),
        new Arg("initialExchangeRate", getExpNumberV),
        new Arg("decimals", getNumberV),
        new Arg("admin", getAddressV),
      ],
      async (
        world,
        {
          symbol,
          name,
          underlying,
          joetroller,
          interestRateModel,
          initialExchangeRate,
          decimals,
          admin,
        }
      ) => {
        // Note: we're going to use the scenario contract as the standard deployment on local networks
        if (world.isLocalNetwork()) {
          return {
            invokation: await JErc20ScenarioContract.deploy<JToken>(
              world,
              from,
              [
                underlying.val,
                joetroller.val,
                interestRateModel.val,
                initialExchangeRate.val,
                name.val,
                symbol.val,
                decimals.val,
                admin.val,
              ]
            ),
            name: name.val,
            symbol: symbol.val,
            decimals: decimals.toNumber(),
            underlying: underlying.val,
            contract: "JErc20Scenario",
            initial_exchange_rate_mantissa: initialExchangeRate
              .encode()
              .toString(),
            admin: admin.val,
          };
        } else {
          return {
            invokation: await JErc20Contract.deploy<JToken>(world, from, [
              underlying.val,
              joetroller.val,
              interestRateModel.val,
              initialExchangeRate.val,
              name.val,
              symbol.val,
              decimals.val,
              admin.val,
            ]),
            name: name.val,
            symbol: symbol.val,
            decimals: decimals.toNumber(),
            underlying: underlying.val,
            contract: "JErc20Immutable",
            initial_exchange_rate_mantissa: initialExchangeRate
              .encode()
              .toString(),
            admin: admin.val,
          };
        }
      },
      { catchall: true }
    ),
  ];

  let tokenData = await getFetcherValue<any, TokenData>(
    "DeployJToken",
    fetchers,
    world,
    params
  );
  let invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const jToken = invokation.value!;
  tokenData.address = jToken._address;

  world = await storeAndSaveContract(
    world,
    jToken,
    tokenData.symbol,
    invokation,
    [
      { index: ["jTokens", tokenData.symbol], data: tokenData },
      { index: ["Tokens", tokenData.symbol], data: tokenData },
    ]
  );

  return { world, jToken, tokenData };
}
