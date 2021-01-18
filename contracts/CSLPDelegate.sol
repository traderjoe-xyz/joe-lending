pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./CErc20Delegate.sol";
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
    function sushi() view external returns (address);
    function poolInfo(uint256) view external returns (PoolInfo memory);
    function userInfo(uint256, address) view external returns (UserInfo memory);
    function pendingSushi(uint256, address) external view returns (uint256);
}

// Ref: https://etherscan.io/address/0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272#code
interface ISushiBar {
    function enter(uint256 _amount) external;
    function leave(uint256 _share) external;
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title Cream's CSushiLP's Contract
 * @notice CToken which wraps Sushi's MasterChef
 * @author Cream
 */
contract CSLPDelegate is CErc20Delegate {
    IMasterChef public masterChef;

    ISushiBar public sushiBar;

    EIP20Interface public sushi;

    uint public pid;

    uint public constant sushiInitialIndex = 1e36;

    struct SushiRewardState {
        uint balance;
        uint index;
        uint block;
    }

    SushiRewardState public slpSupplyState;
    mapping(address => uint) public slpSupplierIndex;
    mapping(address => uint) public xSushiUserAccrued;

    /**
     * @notice Delegate interface to become the implementation
     * @param data The encoded arguments for becoming
     */
    function _becomeImplementation(bytes memory data) public {
        require(msg.sender == admin, "only the admin may initialize the implementation");

        (address masterChefAddress_, address sushiBarAddress_, uint pid_) = abi.decode(data, (address, address, uint));
        masterChef = IMasterChef(masterChefAddress_);
        sushiBar = ISushiBar(sushiBarAddress_);
        sushi = EIP20Interface(masterChef.sushi());

        IMasterChef.PoolInfo memory poolInfo = masterChef.poolInfo(pid_);
        require(poolInfo.lpToken == underlying, "mismatch underlying token");
        pid = pid_;

        // Approve moving our SLP into the master chef contract.
        EIP20Interface(underlying).approve(masterChefAddress_, uint(-1));

        // Approve moving sushi rewards into the sushi bar contract.
        sushi.approve(sushiBarAddress_, uint(-1));

        initState();
    }

    /**
     * @notice Manually claim sushi rewards by user
     */
    function claimSushi() public {
        claimAndStakeSushi(true, 0);

        updateSLPSupplyIndex();
        updateSupplierIndex(msg.sender);

        // Get user's xSushi accrued.
        uint xSushiBalance = xSushiUserAccrued[msg.sender];
        if (xSushiBalance > 0) {
            sushiBar.leave(xSushiBalance);

            sushi.transfer(msg.sender, sushiBalance());

            // Clear user's xSushi accrued.
            xSushiUserAccrued[msg.sender] = 0;

            // Update user xSushi index.
            updateSupplierIndex(msg.sender);
        }
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
    function transferTokens(address spender, address src, address dst, uint tokens) internal returns (uint) {
        claimAndStakeSushi(true, 0);

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
    function getCashPrior() internal view returns (uint) {
        IMasterChef.UserInfo memory userInfo = masterChef.userInfo(pid, address(this));
        return userInfo.amount;
    }

    /**
     * @notice Transfer the underlying to this contract and sweep into master chef
     * @param from Address to transfer funds from
     * @param amount Amount of underlying to transfer
     * @return The actual amount that is transferred
     */
    function doTransferIn(address from, uint amount) internal returns (uint) {
        // Perform the EIP-20 transfer in
        EIP20Interface token = EIP20Interface(underlying);
        require(token.transferFrom(from, address(this), amount), "unexpected EIP-20 transfer in return");

        claimAndStakeSushi(true, amount);

        updateSLPSupplyIndex();
        updateSupplierIndex(from);

        return amount;
    }

    /**
     * @notice Transfer the underlying from this contract, after sweeping out of master chef
     * @param to Address to transfer funds to
     * @param amount Amount of underlying to transfer
     */
    function doTransferOut(address payable to, uint amount) internal {
        claimAndStakeSushi(false, amount);

        updateSLPSupplyIndex();
        updateSupplierIndex(to);

        EIP20Interface token = EIP20Interface(underlying);
        require(token.transfer(to, amount), "unexpected EIP-20 transfer out return");
    }

    /*** Internal functions ***/

    function initState() internal {
        if (slpSupplyState.block == 0) {
            slpSupplyState.index = sushiInitialIndex;
            slpSupplyState.block = block.number;
        }
    }

    function claimAndStakeSushi(bool isDeposit, uint amount) internal {
        if (isDeposit) {
            // Deposit to masterChef.
            masterChef.deposit(pid, amount);
        } else {
            // Withdraw the underlying tokens from masterChef.
            masterChef.withdraw(pid, amount);
        }

        if (sushiBalance() > 0) {
            // Send sushi rewards to SushiBar.
            sushiBar.enter(sushiBalance());
        }
    }

    function updateSLPSupplyIndex() internal {
        uint xSushiAccrued = sub_(xSushiBalance(), slpSupplyState.balance);
        uint supplyTokens = CToken(address(this)).totalSupply();
        Double memory ratio = supplyTokens > 0 ? fraction(xSushiAccrued, supplyTokens) : Double({mantissa: 0});
        Double memory index = add_(Double({mantissa: slpSupplyState.index}), ratio);

        // Update index and block of slpSupplyState.
        slpSupplyState.index = index.mantissa;
        slpSupplyState.block = block.number;
    }

    function updateSupplierIndex(address supplier) internal {
        Double memory supplyIndex = Double({mantissa: slpSupplyState.index});
        Double memory supplierIndex = Double({mantissa: slpSupplierIndex[supplier]});
        slpSupplierIndex[supplier] = supplyIndex.mantissa;

        if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
            supplierIndex.mantissa = sushiInitialIndex;
        }

        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        uint supplierTokens = CToken(address(this)).balanceOf(supplier);
        uint supplierDelta = mul_(supplierTokens, deltaIndex);
        xSushiUserAccrued[supplier] = add_(xSushiUserAccrued[supplier], supplierDelta);

        // Update the balance of slpSupplyState.
        slpSupplyState.balance = xSushiBalance();
    }

    function sushiBalance() internal view returns (uint) {
        return sushi.balanceOf(address(this));
    }

    function xSushiBalance() internal view returns (uint) {
        return sushiBar.balanceOf(address(this));
    }
}
