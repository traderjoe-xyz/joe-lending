// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

import "./JErc20.sol";
import "./JToken.sol";
import "./EIP20NonStandardInterface.sol";

contract JTokenAdmin {
    /// @notice Admin address
    address payable public admin;

    /// @notice Reserve manager address
    address payable public reserveManager;

    /// @notice Emits when a new admin is assigned
    event SetAdmin(address indexed oldAdmin, address indexed newAdmin);

    /// @notice Emits when a new reserve manager is assigned
    event SetReserveManager(address indexed oldReserveManager, address indexed newAdmin);

    /**
     * @dev Throws if called by any account other than the admin.
     */
    modifier onlyAdmin() {
        require(msg.sender == admin, "only the admin may call this function");
        _;
    }

    /**
     * @dev Throws if called by any account other than the reserve manager.
     */
    modifier onlyReserveManager() {
        require(msg.sender == reserveManager, "only the reserve manager may call this function");
        _;
    }

    constructor(address payable _admin) public {
        _setAdmin(_admin);
    }

    /**
     * @notice Get jToken admin
     * @param jToken The jToken address
     */
    function getJTokenAdmin(address jToken) public view returns (address) {
        return JToken(jToken).admin();
    }

    /**
     * @notice Set jToken pending admin
     * @param jToken The jToken address
     * @param newPendingAdmin The new pending admin
     */
    function _setPendingAdmin(address jToken, address payable newPendingAdmin) external onlyAdmin returns (uint256) {
        return JTokenInterface(jToken)._setPendingAdmin(newPendingAdmin);
    }

    /**
     * @notice Accept jToken admin
     * @param jToken The jToken address
     */
    function _acceptAdmin(address jToken) external onlyAdmin returns (uint256) {
        return JTokenInterface(jToken)._acceptAdmin();
    }

    /**
     * @notice Set jToken joetroller
     * @param jToken The jToken address
     * @param newJoetroller The new joetroller address
     */
    function _setJoetroller(address jToken, JoetrollerInterface newJoetroller) external onlyAdmin returns (uint256) {
        return JTokenInterface(jToken)._setJoetroller(newJoetroller);
    }

    /**
     * @notice Set jToken reserve factor
     * @param jToken The jToken address
     * @param newReserveFactorMantissa The new reserve factor
     */
    function _setReserveFactor(address jToken, uint256 newReserveFactorMantissa) external onlyAdmin returns (uint256) {
        return JTokenInterface(jToken)._setReserveFactor(newReserveFactorMantissa);
    }

    /**
     * @notice Reduce jToken reserve
     * @param jToken The jToken address
     * @param reduceAmount The amount of reduction
     */
    function _reduceReserves(address jToken, uint256 reduceAmount) external onlyAdmin returns (uint256) {
        return JTokenInterface(jToken)._reduceReserves(reduceAmount);
    }

    /**
     * @notice Set jToken IRM
     * @param jToken The jToken address
     * @param newInterestRateModel The new IRM address
     */
    function _setInterestRateModel(address jToken, InterestRateModel newInterestRateModel)
        external
        onlyAdmin
        returns (uint256)
    {
        return JTokenInterface(jToken)._setInterestRateModel(newInterestRateModel);
    }

    /**
     * @notice Set jToken collateral cap
     * @dev It will revert if the jToken is not JCollateralCap.
     * @param jToken The jToken address
     * @param newCollateralCap The new collateral cap
     */
    function _setCollateralCap(address jToken, uint256 newCollateralCap) external onlyAdmin {
        JCollateralCapErc20Interface(jToken)._setCollateralCap(newCollateralCap);
    }

    /**
     * @notice Set jToken new implementation
     * @param jToken The jToken address
     * @param implementation The new implementation
     * @param becomeImplementationData The payload data
     */
    function _setImplementation(
        address jToken,
        address implementation,
        bool allowResign,
        bytes calldata becomeImplementationData
    ) external onlyAdmin {
        JDelegatorInterface(jToken)._setImplementation(implementation, allowResign, becomeImplementationData);
    }

    /**
     * @notice Extract reserves by the reserve manager
     * @param jToken The jToken address
     * @param reduceAmount The amount of reduction
     */
    function extractReserves(address jToken, uint256 reduceAmount) external onlyReserveManager {
        require(JTokenInterface(jToken)._reduceReserves(reduceAmount) == 0, "failed to reduce reserves");

        address underlying = JErc20(jToken).underlying();
        _transferToken(underlying, reserveManager, reduceAmount);
    }

    /**
     * @notice Seize the stock assets
     * @param token The token address
     */
    function seize(address token) external onlyAdmin {
        uint256 amount = EIP20NonStandardInterface(token).balanceOf(address(this));
        if (amount > 0) {
            _transferToken(token, admin, amount);
        }
    }

    /**
     * @notice Set the admin
     * @param newAdmin The new admin
     */
    function setAdmin(address payable newAdmin) external onlyAdmin {
        _setAdmin(newAdmin);
    }

    /**
     * @notice Set the reserve manager
     * @param newReserveManager The new reserve manager
     */
    function setReserveManager(address payable newReserveManager) external onlyAdmin {
        address oldReserveManager = reserveManager;
        reserveManager = newReserveManager;

        emit SetReserveManager(oldReserveManager, newReserveManager);
    }

    /* Internal functions */

    function _setAdmin(address payable newAdmin) private {
        require(newAdmin != address(0), "new admin cannot be zero address");
        address oldAdmin = admin;
        admin = newAdmin;
        emit SetAdmin(oldAdmin, newAdmin);
    }

    function _transferToken(
        address token,
        address payable to,
        uint256 amount
    ) private {
        require(to != address(0), "receiver cannot be zero address");

        EIP20NonStandardInterface(token).transfer(to, amount);

        bool success;
        assembly {
            switch returndatasize()
            case 0 {
                // This is a non-standard ERC-20
                success := not(0) // set success to true
            }
            case 32 {
                // This is a joelaint ERC-20
                returndatacopy(0, 0, 32)
                success := mload(0) // Set `success = returndata` of external call
            }
            default {
                if lt(returndatasize(), 32) {
                    revert(0, 0) // This is a non-compliant ERC-20, revert.
                }
                returndatacopy(0, 0, 32) // Vyper joeiler before 0.2.8 will not truncate RETURNDATASIZE.
                success := mload(0) // See here: https://github.com/vyperlang/vyper/security/advisories/GHSA-375m-5fvv-xq23
            }
        }
        require(success, "TOKEN_TRANSFER_OUT_FAILED");
    }

    function compareStrings(string memory a, string memory b) private pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function() external payable {}
}
