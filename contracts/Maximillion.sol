// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

import "./JWrappedNative.sol";

/**
 * @title Compound's Maximillion Contract
 * @author Compound
 */
contract Maximillion {
    /**
     * @notice The default jAvax market to repay in
     */
    JWrappedNative public jAvax;

    /**
     * @notice Construct a Maximillion to repay max in a JWrappedNative market
     */
    constructor(JWrappedNative jAvax_) public {
        jAvax = jAvax_;
    }

    /**
     * @notice msg.sender sends Ether to repay an account's borrow in the jAvax market
     * @dev The provided Ether is applied towards the borrow balance, any excess is refunded
     * @param borrower The address of the borrower account to repay on behalf of
     */
    function repayBehalf(address borrower) public payable {
        repayBehalfExplicit(borrower, jAvax);
    }

    /**
     * @notice msg.sender sends Ether to repay an account's borrow in a jAvax market
     * @dev The provided Ether is applied towards the borrow balance, any excess is refunded
     * @param borrower The address of the borrower account to repay on behalf of
     * @param jAvax_ The address of the jAvax contract to repay in
     */
    function repayBehalfExplicit(address borrower, JWrappedNative jAvax_) public payable {
        uint256 received = msg.value;
        uint256 borrows = jAvax_.borrowBalanceCurrent(borrower);
        if (received > borrows) {
            jAvax_.repayBorrowBehalfNative.value(borrows)(borrower);
            msg.sender.transfer(received - borrows);
        } else {
            jAvax_.repayBorrowBehalfNative.value(received)(borrower);
        }
    }
}
