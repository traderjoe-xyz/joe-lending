// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

import "./JCollateralCapErc20.sol";

/**
 * @title Cream's JCollateralCapErc20Delegate Contract
 * @notice JTokens which wrap an EIP-20 underlying and are delegated to
 * @author Cream
 */
contract JCollateralCapErc20Delegate is JCollateralCapErc20 {
    /**
     * @notice Construct an empty delegate
     */
    constructor() public {}

    /**
     * @notice Called by the delegator on a delegate to initialize it for duty
     * @param data The encoded bytes data for any initialization
     */
    function _becomeImplementation(bytes memory data) public {
        // Shh -- currently unused
        data;

        // Shh -- we don't ever want this hook to be marked pure
        if (false) {
            implementation = address(0);
        }

        require(msg.sender == admin, "only the admin may call _becomeImplementation");

        // Set internal cash when becoming implementation
        internalCash = getCashOnChain();

        // Set JToken version in joetroller
        JoetrollerInterfaceExtension(address(joetroller)).updateJTokenVersion(
            address(this),
            JoetrollerV1Storage.Version.COLLATERALCAP
        );
    }

    /**
     * @notice Called by the delegator on a delegate to forfeit its responsibility
     */
    function _resignImplementation() public {
        // Shh -- we don't ever want this hook to be marked pure
        if (false) {
            implementation = address(0);
        }

        require(msg.sender == admin, "only the admin may call _resignImplementation");
    }
}
