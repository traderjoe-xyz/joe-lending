// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

interface IRewardDistributor {
    function claimReward(uint8 rewardType, address payable holder) external;

    function rewardAccrued(uint8 rewardType, address holder) external view returns (uint256);
}
