import { Event } from "../Event";
import { World } from "../World";
import { PriceOracleProxy } from "../Contract/PriceOracleProxy";
import { Invokation } from "../Invokation";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { storeAndSaveContract } from "../Networks";
import { getContract } from "../Contract";
import { getAddressV } from "../CoreValue";
import { AddressV } from "../Value";

const PriceOracleProxyContract = getContract("PriceOracleProxy");

export interface PriceOracleProxyData {
  invokation?: Invokation<PriceOracleProxy>;
  contract?: PriceOracleProxy;
  description: string;
  address?: string;
  jAVAX: string;
  jXJOE: string;
}

export async function buildPriceOracleProxy(
  world: World,
  from: string,
  event: Event
): Promise<{
  world: World;
  priceOracleProxy: PriceOracleProxy;
  invokation: Invokation<PriceOracleProxy>;
}> {
  const fetchers = [
    new Fetcher<
      {
        guardian: AddressV;
        priceOracle: AddressV;
        jAVAX: AddressV;
        jXJOE: AddressV;
      },
      PriceOracleProxyData
    >(
      `
        #### Price Oracle Proxy

        * "Deploy <Guardian:Address> <PriceOracle:Address> <jAVAX:Address> <jXJOE:Address>" - The Price Oracle which proxies to a backing oracle
        * E.g. "PriceOracleProxy Deploy Admin (PriceOracle Address) jAVAX jXJOE"
      `,
      "PriceOracleProxy",
      [
        new Arg("guardian", getAddressV),
        new Arg("priceOracle", getAddressV),
        new Arg("jAVAX", getAddressV),
        new Arg("jXJOE", getAddressV),
      ],
      async (world, { guardian, priceOracle, jAVAX, jXJOE }) => {
        return {
          invokation: await PriceOracleProxyContract.deploy<PriceOracleProxy>(
            world,
            from,
            [guardian.val, priceOracle.val, jAVAX.val, jXJOE.val]
          ),
          description: "Price Oracle Proxy",
          jAVAX: jAVAX.val,
          jXJOE: jXJOE.val,
        };
      },
      { catchall: true }
    ),
  ];

  let priceOracleProxyData = await getFetcherValue<any, PriceOracleProxyData>(
    "DeployPriceOracleProxy",
    fetchers,
    world,
    event
  );
  let invokation = priceOracleProxyData.invokation!;
  delete priceOracleProxyData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const priceOracleProxy = invokation.value!;
  priceOracleProxyData.address = priceOracleProxy._address;

  world = await storeAndSaveContract(
    world,
    priceOracleProxy,
    "PriceOracleProxy",
    invokation,
    [{ index: ["PriceOracleProxy"], data: priceOracleProxyData }]
  );

  return { world, priceOracleProxy, invokation };
}
