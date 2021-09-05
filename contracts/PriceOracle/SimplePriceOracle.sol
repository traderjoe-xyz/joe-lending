// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

import "./PriceOracle.sol";
import "../JErc20.sol";

contract SimplePriceOracle is PriceOracle {
    mapping(address => uint256) prices;
    event PricePosted(
        address asset,
        uint256 previousPriceMantissa,
        uint256 requestedPriceMantissa,
        uint256 newPriceMantissa
    );

    function getUnderlyingPrice(JToken jToken) public view returns (uint256) {
        if (compareStrings(jToken.symbol(), "jAVAX")) {
            return 1e18;
        } else {
            return prices[address(JErc20(address(jToken)).underlying())];
        }
    }

    function setUnderlyingPrice(JToken jToken, uint256 underlyingPriceMantissa) public {
        address asset = address(JErc20(address(jToken)).underlying());
        emit PricePosted(asset, prices[asset], underlyingPriceMantissa, underlyingPriceMantissa);
        prices[asset] = underlyingPriceMantissa;
    }

    function setDirectPrice(address asset, uint256 price) public {
        emit PricePosted(asset, prices[asset], price, price);
        prices[asset] = price;
    }

    // v1 price oracle interface for use as backing of proxy
    function assetPrices(address asset) external view returns (uint256) {
        return prices[asset];
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
