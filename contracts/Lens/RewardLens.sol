// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

import "@openzeppelin/contracts/ownership/Ownable.sol";

/**
 * @notice This is a helper for fetching and maintaining supply/borrow rewards for lending markets.
 */
contract RewardLens is Ownable {
    struct MarketRewards { 
        uint256 supplyRewardsJoePerSec; 
        uint256 borrowRewardsJoePerSec; 
        uint256 supplyRewardsAvaxPerSec; 
        uint256 borrowRewardsAvaxPerSec;
    }

    mapping(address => MarketRewards) public allMarketRewards;

    function setMarketRewards(
        address market, 
        uint256 supplyRewardsJoePerSec, 
        uint256 borrowRewardsJoePerSec, 
        uint256 supplyRewardsAvaxPerSec, 
        uint256 borrowRewardsAvaxPerSec
    ) external onlyOwner {
        allMarketRewards[market].supplyRewardsJoePerSec = supplyRewardsJoePerSec;
        allMarketRewards[market].borrowRewardsJoePerSec = borrowRewardsJoePerSec;
        allMarketRewards[market].supplyRewardsAvaxPerSec = supplyRewardsAvaxPerSec;
        allMarketRewards[market].borrowRewardsAvaxPerSec = borrowRewardsAvaxPerSec;
    }
}
