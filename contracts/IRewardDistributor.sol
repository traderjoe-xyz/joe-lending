// SPDX-License-Identifier: MIT

pragma solidity ^0.5.16;

/**
 * @title IRewardDistributor
 * @author Trader Joe
 * @dev Used to be call `RewardDistributor.claimReward` directly
 */
interface IRewardDistributor {
    function claimReward(uint8 rewardType, address payable holder) external;
}
