pragma solidity ^0.5.16;

import "../../contracts/PriceOracle.sol";

contract FixedPriceOracle is PriceOracle {
    uint256 public price;

    constructor(uint256 _price) public {
        price = _price;
    }

    function getUnderlyingPrice(CToken cToken) public view returns (uint256) {
        cToken;
        return price;
    }

    function assetPrices(address asset) public view returns (uint256) {
        asset;
        return price;
    }
}
