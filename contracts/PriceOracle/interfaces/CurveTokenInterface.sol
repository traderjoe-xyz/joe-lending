pragma solidity ^0.5.16;

interface CurveTokenV3Interface {
    function minter() external view returns (address);
}

interface CurveSwapInterface {
    function get_virtual_price() external view returns (uint256);
}
