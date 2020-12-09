import {Event} from '../Event';
import {addAction, World} from '../World';
import {MockAggregator} from '../Contract/Aggregator';
import {Invokation, invoke} from '../Invokation';
import {
  getAddressV,
  getExpNumberV,
  getStringV
} from '../CoreValue';
import {
  AddressV,
  EventV,
  NothingV,
  NumberV,
  StringV
} from '../Value';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {storeAndSaveContract} from '../Networks';
import {getContract, getTestContract} from '../Contract';

const MockAggregator = getTestContract('MockAggregator');

export interface MockAggregatorData {
  invokation?: Invokation<MockAggregator>,
  contract?: MockAggregator,
  description: string,
  address?: string
}

export async function buildAggregator(world: World, from: string, event: Event): Promise<{world: World, mockAggregator: MockAggregator, invokation: Invokation<MockAggregator>}> {
  const fetchers = [
    new Fetcher<{price: NumberV}, MockAggregatorData>(`
        #### Fixed

        * "Fixed price:<Exp>" - Fixed price
          * E.g. "MockAggregator Deploy (Fixed 20.0)"
      `,
      "Fixed",
      [
        new Arg("price", getExpNumberV),
      ],
      async (world, {price}) => {
        return {
          invokation: await MockAggregator.deploy<MockAggregator>(world, from, [price.val]),
          description: "Fixed Mock Aggregator"
        };
      }
    )
  ];

  let mockAggregatorData = await getFetcherValue<any, MockAggregatorData>("DeployMockAggregator", fetchers, world, event);
  let invokation = mockAggregatorData.invokation!;
  delete mockAggregatorData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const mockAggregator = invokation.value!;
  mockAggregatorData.address = mockAggregator._address;

  world = await storeAndSaveContract(
    world,
    mockAggregator,
    'MockAggregator',
    invokation,
    [
      { index: ['MockAggregator'], data: mockAggregatorData }
    ]
  );

  return {world, mockAggregator, invokation};
}
