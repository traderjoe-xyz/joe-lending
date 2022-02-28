// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

/**
 * @notice This is a helper for fetching and maintaining supply/borrow rewards for lending markets.
 */
interface IRewardLens {
    struct MarketRewards { 
        uint256 supplyRewardsJoePerSec; 
        uint256 borrowRewardsJoePerSec; 
        uint256 supplyRewardsAvaxPerSec; 
        uint256 borrowRewardsAvaxPerSec;
    }
    
    function allMarketRewards(address market) external view returns (IRewardLens.MarketRewards memory);
}
