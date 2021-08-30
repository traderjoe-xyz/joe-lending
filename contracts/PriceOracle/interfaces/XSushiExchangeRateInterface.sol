// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

interface XSushiExchangeRateInterface {
    function getExchangeRate() external view returns (uint256);
}
