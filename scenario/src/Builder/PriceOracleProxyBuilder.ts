import {Event} from '../Event';
import {addAction, World} from '../World';
import {PriceOracleProxy} from '../Contract/PriceOracleProxy';
import {Invokation} from '../Invokation';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {storeAndSaveContract} from '../Networks';
import {getContract} from '../Contract';
import {getAddressV} from '../CoreValue';
import {AddressV} from '../Value';

const PriceOracleProxyContract = getContract("PriceOracleProxy");

export interface PriceOracleProxyData {
  invokation?: Invokation<PriceOracleProxy>,
  contract?: PriceOracleProxy,
  description: string,
  address?: string,
  cETH: string,
  cYCRV: string,
  cYYCRV: string,
  cYETH: string,
  cXSUSHI: string
}

export async function buildPriceOracleProxy(world: World, from: string, event: Event): Promise<{world: World, priceOracleProxy: PriceOracleProxy, invokation: Invokation<PriceOracleProxy>}> {
  const fetchers = [
    new Fetcher<{guardian: AddressV, priceOracle: AddressV, cETH: AddressV, cYCRV: AddressV, cYYCRV: AddressV, cYETH: AddressV, cXSUSHI: AddressV}, PriceOracleProxyData>(`
        #### Price Oracle Proxy

        * "Deploy <Guardian:Address> <PriceOracle:Address> <cETH:Address> <cYCRV:Address> <cYYCRV:Address> <cYETH:Address> <cXSUSHI:Address>" - The Price Oracle which proxies to a backing oracle
        * E.g. "PriceOracleProxy Deploy Admin (PriceOracle Address) cETH cYCRV cYYCRV cYETH cXSUSHI"
      `,
      "PriceOracleProxy",
      [
        new Arg("guardian", getAddressV),
        new Arg("priceOracle", getAddressV),
        new Arg("cETH", getAddressV),
        new Arg("cYCRV", getAddressV),
        new Arg("cYYCRV", getAddressV),
        new Arg("cYETH", getAddressV),
        new Arg("cXSUSHI", getAddressV)
      ],
      async (world, {guardian, priceOracle, cETH, cYCRV, cYYCRV, cYETH, cXSUSHI}) => {
        return {
          invokation: await PriceOracleProxyContract.deploy<PriceOracleProxy>(world, from, [guardian.val, priceOracle.val, cETH.val, cYCRV.val, cYYCRV.val, cYETH.val, cXSUSHI.val]),
          description: "Price Oracle Proxy",
          cETH: cETH.val,
          cYCRV: cYCRV.val,
          cYYCRV: cYYCRV.val,
          cYETH: cYETH.val,
          cXSUSHI: cXSUSHI.val,
        };
      },
      {catchall: true}
    )
  ];

  let priceOracleProxyData = await getFetcherValue<any, PriceOracleProxyData>("DeployPriceOracleProxy", fetchers, world, event);
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
    'PriceOracleProxy',
    invokation,
    [
      { index: ['PriceOracleProxy'], data: priceOracleProxyData }
    ]
  );

  return {world, priceOracleProxy, invokation};
}
