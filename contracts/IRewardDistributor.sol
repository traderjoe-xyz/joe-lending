// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

/**
 * @notice Interface for Reward Distributor to get reward supply/borrow speeds
 */
interface IRewardDistributor {
    /**
     * @notice Get JOE/AVAX reward supply speed for a single market
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market whose reward speed to get
     * @return The supply reward speed for the market/type
     */
    function rewardSupplySpeeds(uint8 rewardType, address jToken) external view returns (uint256);

    /**
     * @notice Get JOE/AVAX reward borrow speed for a single market
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market whose reward speed to get
     * @return The borrow reward speed for the market/type
     */
    function rewardBorrowSpeeds(uint8 rewardType, address jToken) external view returns (uint256);
}
