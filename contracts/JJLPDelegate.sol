// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./JCapableErc20Delegate.sol";
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

    function joe() external view returns (address);

    function poolInfo(uint256) external view returns (PoolInfo memory);

    function userInfo(uint256, address) external view returns (UserInfo memory);

    function pendingJoe(uint256, address) external view returns (uint256);
}

// Ref: https://etherscan.io/address/0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272#code
interface IJoeBar {
    function enter(uint256 _amount) external;

    function leave(uint256 _share) external;
}

/**
 * @title Cream's JJoeLP's Contract
 * @notice JToken which wraps Joe's LP token
 * @author Cream
 */
contract JJLPDelegate is JCapableErc20Delegate {
    /**
     * @notice MasterChef address
     */
    address public masterChef;

    /**
     * @notice JoeBar address
     */
    address public joeBar;

    /**
     * @notice Joe token address
     */
    address public joe;

    /**
     * @notice Pool ID of this LP in MasterChef
     */
    uint256 public pid;

    /**
     * @notice Container for joe rewards state
     * @member balance The balance of xJoe
     * @member index The last updated index
     */
    struct JoeRewardState {
        uint256 balance;
        uint256 index;
    }

    /**
     * @notice The state of JLP supply
     */
    JoeRewardState public jlpSupplyState;

    /**
     * @notice The index of every JLP supplier
     */
    mapping(address => uint256) public jlpSupplierIndex;

    /**
     * @notice The xJoe amount of every user
     */
    mapping(address => uint256) public xJoeUserAccrued;

    /**
     * @notice Delegate interface to become the implementation
     * @param data The encoded arguments for becoming
     */
    function _becomeImplementation(bytes memory data) public {
        super._becomeImplementation(data);

        (address masterChefAddress_, address joeBarAddress_, uint256 pid_) = abi.decode(
            data,
            (address, address, uint256)
        );
        masterChef = masterChefAddress_;
        joeBar = joeBarAddress_;
        joe = IMasterChef(masterChef).joe();

        IMasterChef.PoolInfo memory poolInfo = IMasterChef(masterChef).poolInfo(pid_);
        require(poolInfo.lpToken == underlying, "mismatch underlying token");
        pid = pid_;

        // Approve moving our JLP into the master chef contract.
        EIP20Interface(underlying).approve(masterChefAddress_, uint256(-1));

        // Approve moving joe rewards into the joe bar contract.
        EIP20Interface(joe).approve(joeBarAddress_, uint256(-1));
    }

    /**
     * @notice Manually claim joe rewards by user
     * @return The amount of joe rewards user claims
     */
    function claimJoe(address account) public returns (uint256) {
        claimAndStakeJoe();

        updateJLPSupplyIndex();
        updateSupplierIndex(account);

        // Get user's xJoe accrued.
        uint256 xJoeBalance = xJoeUserAccrued[account];
        if (xJoeBalance > 0) {
            // Withdraw user xJoe balance and subtract the amount in jlpSupplyState
            IJoeBar(joeBar).leave(xJoeBalance);
            jlpSupplyState.balance = sub_(jlpSupplyState.balance, xJoeBalance);

            uint256 balance = joeBalance();
            EIP20Interface(joe).transfer(account, balance);

            // Clear user's xJoe accrued.
            xJoeUserAccrued[account] = 0;

            return balance;
        }
        return 0;
    }

    /*** JToken Overrides ***/

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
        claimAndStakeJoe();

        updateJLPSupplyIndex();
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

        if (joeBalance() > 0) {
            // Send joe rewards to JoeBar.
            IJoeBar(joeBar).enter(joeBalance());
        }

        updateJLPSupplyIndex();
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

        if (joeBalance() > 0) {
            // Send joe rewards to JoeBar.
            IJoeBar(joeBar).enter(joeBalance());
        }

        updateJLPSupplyIndex();
        updateSupplierIndex(to);

        EIP20Interface token = EIP20Interface(underlying);
        require(token.transfer(to, amount), "unexpected EIP-20 transfer out return");
    }

    /*** Internal functions ***/

    function claimAndStakeJoe() internal {
        // Deposit 0 JLP into MasterChef to claim joe rewards.
        IMasterChef(masterChef).deposit(pid, 0);

        if (joeBalance() > 0) {
            // Send joe rewards to JoeBar.
            IJoeBar(joeBar).enter(joeBalance());
        }
    }

    function updateJLPSupplyIndex() internal {
        uint256 xJoeBalance = xJoeBalance();
        uint256 xJoeAccrued = sub_(xJoeBalance, jlpSupplyState.balance);
        uint256 supplyTokens = JToken(address(this)).totalSupply();
        Double memory ratio = supplyTokens > 0 ? fraction(xJoeAccrued, supplyTokens) : Double({mantissa: 0});
        Double memory index = add_(Double({mantissa: jlpSupplyState.index}), ratio);

        // Update jlpSupplyState.
        jlpSupplyState.index = index.mantissa;
        jlpSupplyState.balance = xJoeBalance;
    }

    function updateSupplierIndex(address supplier) internal {
        Double memory supplyIndex = Double({mantissa: jlpSupplyState.index});
        Double memory supplierIndex = Double({mantissa: jlpSupplierIndex[supplier]});
        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        if (deltaIndex.mantissa > 0) {
            uint256 supplierTokens = JToken(address(this)).balanceOf(supplier);
            uint256 supplierDelta = mul_(supplierTokens, deltaIndex);
            xJoeUserAccrued[supplier] = add_(xJoeUserAccrued[supplier], supplierDelta);
            jlpSupplierIndex[supplier] = supplyIndex.mantissa;
        }
    }

    function joeBalance() internal view returns (uint256) {
        return EIP20Interface(joe).balanceOf(address(this));
    }

    function xJoeBalance() internal view returns (uint256) {
        return EIP20Interface(joeBar).balanceOf(address(this));
    }
}
