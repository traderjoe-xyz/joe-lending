pragma solidity ^0.5.16;

import "../../../contracts/PriceOracle.sol";

contract PriceOracleModel is PriceOracle {
    uint256 dummy;

    function isPriceOracle() external pure returns (bool) {
        return true;
    }

    function getUnderlyingPrice(CToken cToken) external view returns (uint256) {
        return dummy;
    }
}
