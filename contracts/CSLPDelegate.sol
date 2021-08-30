// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./CCapableErc20Delegate.sol";
import "./EIP20Interface.sol";

// Ref: https://etherscan.io/address/0xc2edad668740f1aa35e4d8f227fb8e17dca888cd#code
interface IMasterChef {
    struct PoolInfo {
        address lpToken;
    }

    struct UserInfo {
        uint256 amount;
    }

    function deposit(uint256, uint256) external;

    function withdraw(uint256, uint256) external;

    function sushi() external view returns (address);

    function poolInfo(uint256) external view returns (PoolInfo memory);

    function userInfo(uint256, address) external view returns (UserInfo memory);

    function pendingSushi(uint256, address) external view returns (uint256);
}

// Ref: https://etherscan.io/address/0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272#code
interface ISushiBar {
    function enter(uint256 _amount) external;

    function leave(uint256 _share) external;
}

/**
 * @title Cream's CSushiLP's Contract
 * @notice CToken which wraps Sushi's LP token
 * @author Cream
 */
contract CSLPDelegate is CCapableErc20Delegate {
    /**
     * @notice MasterChef address
     */
    address public masterChef;

    /**
     * @notice SushiBar address
     */
    address public sushiBar;

    /**
     * @notice Sushi token address
     */
    address public sushi;

    /**
     * @notice Pool ID of this LP in MasterChef
     */
    uint256 public pid;

    /**
     * @notice Container for sushi rewards state
     * @member balance The balance of xSushi
     * @member index The last updated index
     */
    struct SushiRewardState {
        uint256 balance;
        uint256 index;
    }

    /**
     * @notice The state of SLP supply
     */
    SushiRewardState public slpSupplyState;

    /**
     * @notice The index of every SLP supplier
     */
    mapping(address => uint256) public slpSupplierIndex;

    /**
     * @notice The xSushi amount of every user
     */
    mapping(address => uint256) public xSushiUserAccrued;

    /**
     * @notice Delegate interface to become the implementation
     * @param data The encoded arguments for becoming
     */
    function _becomeImplementation(bytes memory data) public {
        super._becomeImplementation(data);

        (address masterChefAddress_, address sushiBarAddress_, uint256 pid_) = abi.decode(
            data,
            (address, address, uint256)
        );
        masterChef = masterChefAddress_;
        sushiBar = sushiBarAddress_;
        sushi = IMasterChef(masterChef).sushi();

        IMasterChef.PoolInfo memory poolInfo = IMasterChef(masterChef).poolInfo(pid_);
        require(poolInfo.lpToken == underlying, "mismatch underlying token");
        pid = pid_;

        // Approve moving our SLP into the master chef contract.
        EIP20Interface(underlying).approve(masterChefAddress_, uint256(-1));

        // Approve moving sushi rewards into the sushi bar contract.
        EIP20Interface(sushi).approve(sushiBarAddress_, uint256(-1));
    }

    /**
     * @notice Manually claim sushi rewards by user
     * @return The amount of sushi rewards user claims
     */
    function claimSushi(address account) public returns (uint256) {
        claimAndStakeSushi();

        updateSLPSupplyIndex();
        updateSupplierIndex(account);

        // Get user's xSushi accrued.
        uint256 xSushiBalance = xSushiUserAccrued[account];
        if (xSushiBalance > 0) {
            // Withdraw user xSushi balance and subtract the amount in slpSupplyState
            ISushiBar(sushiBar).leave(xSushiBalance);
            slpSupplyState.balance = sub_(slpSupplyState.balance, xSushiBalance);

            uint256 balance = sushiBalance();
            EIP20Interface(sushi).transfer(account, balance);

            // Clear user's xSushi accrued.
            xSushiUserAccrued[account] = 0;

            return balance;
        }
        return 0;
    }

    /*** CToken Overrides ***/

    /**
     * @notice Transfer `tokens` tokens from `src` to `dst` by `spender`
     * @param spender The address of the account performing the transfer
     * @param src The address of the source account
     * @param dst The address of the destination account
     * @param tokens The number of tokens to transfer
     * @return Whether or not the transfer succeeded
     */
    function transferTokens(
        address spender,
        address src,
        address dst,
        uint256 tokens
    ) internal returns (uint256) {
        claimAndStakeSushi();

        updateSLPSupplyIndex();
        updateSupplierIndex(src);
        updateSupplierIndex(dst);

        return super.transferTokens(spender, src, dst, tokens);
    }

    /*** Safe Token ***/

    /**
     * @notice Gets balance of this contract in terms of the underlying
     * @return The quantity of underlying tokens owned by this contract
     */
    function getCashPrior() internal view returns (uint256) {
        IMasterChef.UserInfo memory userInfo = IMasterChef(masterChef).userInfo(pid, address(this));
        return userInfo.amount;
    }

    /**
     * @notice Transfer the underlying to this contract and sweep into master chef
     * @param from Address to transfer funds from
     * @param amount Amount of underlying to transfer
     * @param isNative The amount is in native or not
     * @return The actual amount that is transferred
     */
    function doTransferIn(
        address from,
        uint256 amount,
        bool isNative
    ) internal returns (uint256) {
        isNative; // unused

        // Perform the EIP-20 transfer in
        EIP20Interface token = EIP20Interface(underlying);
        require(token.transferFrom(from, address(this), amount), "unexpected EIP-20 transfer in return");

        // Deposit to masterChef.
        IMasterChef(masterChef).deposit(pid, amount);

        if (sushiBalance() > 0) {
            // Send sushi rewards to SushiBar.
            ISushiBar(sushiBar).enter(sushiBalance());
        }

        updateSLPSupplyIndex();
        updateSupplierIndex(from);

        return amount;
    }

    /**
     * @notice Transfer the underlying from this contract, after sweeping out of master chef
     * @param to Address to transfer funds to
     * @param amount Amount of underlying to transfer
     * @param isNative The amount is in native or not
     */
    function doTransferOut(
        address payable to,
        uint256 amount,
        bool isNative
    ) internal {
        isNative; // unused

        // Withdraw the underlying tokens from masterChef.
        IMasterChef(masterChef).withdraw(pid, amount);

        if (sushiBalance() > 0) {
            // Send sushi rewards to SushiBar.
            ISushiBar(sushiBar).enter(sushiBalance());
        }

        updateSLPSupplyIndex();
        updateSupplierIndex(to);

        EIP20Interface token = EIP20Interface(underlying);
        require(token.transfer(to, amount), "unexpected EIP-20 transfer out return");
    }

    /*** Internal functions ***/

    function claimAndStakeSushi() internal {
        // Deposit 0 SLP into MasterChef to claim sushi rewards.
        IMasterChef(masterChef).deposit(pid, 0);

        if (sushiBalance() > 0) {
            // Send sushi rewards to SushiBar.
            ISushiBar(sushiBar).enter(sushiBalance());
        }
    }

    function updateSLPSupplyIndex() internal {
        uint256 xSushiBalance = xSushiBalance();
        uint256 xSushiAccrued = sub_(xSushiBalance, slpSupplyState.balance);
        uint256 supplyTokens = CToken(address(this)).totalSupply();
        Double memory ratio = supplyTokens > 0 ? fraction(xSushiAccrued, supplyTokens) : Double({mantissa: 0});
        Double memory index = add_(Double({mantissa: slpSupplyState.index}), ratio);

        // Update slpSupplyState.
        slpSupplyState.index = index.mantissa;
        slpSupplyState.balance = xSushiBalance;
    }

    function updateSupplierIndex(address supplier) internal {
        Double memory supplyIndex = Double({mantissa: slpSupplyState.index});
        Double memory supplierIndex = Double({mantissa: slpSupplierIndex[supplier]});
        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        if (deltaIndex.mantissa > 0) {
            uint256 supplierTokens = CToken(address(this)).balanceOf(supplier);
            uint256 supplierDelta = mul_(supplierTokens, deltaIndex);
            xSushiUserAccrued[supplier] = add_(xSushiUserAccrued[supplier], supplierDelta);
            slpSupplierIndex[supplier] = supplyIndex.mantissa;
        }
    }

    function sushiBalance() internal view returns (uint256) {
        return EIP20Interface(sushi).balanceOf(address(this));
    }

    function xSushiBalance() internal view returns (uint256) {
        return EIP20Interface(sushiBar).balanceOf(address(this));
    }
}
