// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

contract LiquidityMiningInterface {
    function joetroller() external view returns (address);

    function updateSupplyIndex(address jToken, address[] calldata accounts) external;

    function updateBorrowIndex(address jToken, address[] calldata accounts) external;
}
