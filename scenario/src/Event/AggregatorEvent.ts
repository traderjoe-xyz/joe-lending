import {Event} from '../Event';
import {addAction, World} from '../World';
import {buildAggregator} from '../Builder/Aggregator';
import {invoke} from '../Invokation';
import {CToken} from '../Contract/CToken';
import {
  getEventV,
  getExpNumberV,
  getStringV,
  getNumberV
} from '../CoreValue';
import {
  EventV,
  NumberV,
  StringV
} from '../Value';
import {Arg, Command, processCommandEvent, View} from '../Command';
import {getPriceOracleProxy} from '../ContractLookup';
import {getCTokenV} from '../Value/CTokenValue';
import {verify} from '../Verify';

async function genMockAggregator(world: World, from: string, params: Event): Promise<World> {
  let mockAggregator;
  let invokation;

  ({world, mockAggregator, invokation} = await buildAggregator(world, from, params));

  world = addAction(
    world,
    `Deployed MockAggregator to address ${mockAggregator._address}`,
    invokation
  );

  return world;
}

export function mockAggregatorCommands() {
  return [
    new Command<{params: EventV}>(`
        #### Deploy

        * "Deploy ...params" - Generates a new mock aggregator
          * E.g. "MockAggregator Deploy"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, {variadic: true})
      ],
      (world, from, {params}) => genMockAggregator(world, from, params.val)
    )
  ];
}

export async function processMockAggregatorEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("MockAggregator", mockAggregatorCommands(), world, event, from);
}
