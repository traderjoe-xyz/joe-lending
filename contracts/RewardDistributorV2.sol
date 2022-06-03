// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./EIP20Interface.sol";
import "./Exponential.sol";
import "./SafeMath.sol";

interface IJToken {
    function balanceOf(address owner) external view returns (uint256);

    function borrowIndex() external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function totalBorrows() external view returns (uint256);

    function borrowBalanceStored(address account) external view returns (uint256);
}

interface IJoetroller {
    function isMarketListed(address jTokenAddress) external view returns (bool);

    function getAllMarkets() external view returns (IJToken[] memory);

    function rewardDistributor() external view returns (address);
}

contract RewardDistributorStorageV2 {
    /// @notice Administrator for this contract
    address public admin;

    /// @notice Active brains of Unitroller
    IJoetroller public joetroller;

    struct RewardMarketState {
        /// @notice The market's last updated joeBorrowIndex or joeSupplyIndex
        uint208 index;
        /// @notice The timestamp number the index was last updated at
        uint48 timestamp;
    }

    /// @notice The portion of supply reward rate that each market currently receives
    mapping(uint8 => mapping(address => uint256)) public rewardSupplySpeeds;

    /// @notice The portion of borrow reward rate that each market currently receives
    mapping(uint8 => mapping(address => uint256)) public rewardBorrowSpeeds;

    /// @notice The JOE/AVAX market supply state for each market
    mapping(uint8 => mapping(address => RewardMarketState)) public rewardSupplyState;

    /// @notice The JOE/AVAX market borrow state for each market
    mapping(uint8 => mapping(address => RewardMarketState)) public rewardBorrowState;

    /// @notice The JOE/AVAX borrow index for each market for each supplier as of the last time they accrued reward
    mapping(uint8 => mapping(address => mapping(address => uint256))) public rewardSupplierIndex;

    /// @notice The JOE/AVAX borrow index for each market for each borrower as of the last time they accrued reward
    mapping(uint8 => mapping(address => mapping(address => uint256))) public rewardBorrowerIndex;

    /// @notice The JOE/AVAX accrued but not yet transferred to each user
    mapping(uint8 => mapping(address => uint256)) public rewardAccrued;

    /// @notice JOE token contract address
    EIP20Interface public joe;

    /// @notice If initializeRewardAccrued is locked
    bool public isInitializeRewardAccruedLocked;
}

contract RewardDistributorV2 is RewardDistributorStorageV2, Exponential {
    using SafeMath for uint256;

    /// @notice Emitted when a new reward supply speed is calculated for a market
    event RewardSupplySpeedUpdated(uint8 rewardType, IJToken indexed jToken, uint256 newSpeed);

    /// @notice Emitted when a new reward borrow speed is calculated for a market
    event RewardBorrowSpeedUpdated(uint8 rewardType, IJToken indexed jToken, uint256 newSpeed);

    /// @notice Emitted when JOE/AVAX is distributed to a supplier
    event DistributedSupplierReward(
        uint8 rewardType,
        IJToken indexed jToken,
        address indexed supplier,
        uint256 rewardDelta,
        uint256 rewardSupplyIndex
    );

    /// @notice Emitted when JOE/AVAX is distributed to a borrower
    event DistributedBorrowerReward(
        uint8 rewardType,
        IJToken indexed jToken,
        address indexed borrower,
        uint256 rewardDelta,
        uint256 rewardBorrowIndex
    );

    /// @notice Emitted when JOE is granted by admin
    event RewardGranted(uint8 rewardType, address recipient, uint256 amount);

    /// @notice Emitted when Joe address is changed by admin
    event JoeSet(EIP20Interface indexed joe);

    /// @notice Emitted when Joetroller address is changed by admin
    event JoetrollerSet(IJoetroller indexed newJoetroller);

    /// @notice Emitted when admin is transfered
    event AdminTransferred(address oldAdmin, address newAdmin);

    /// @notice Emitted when accruedRewards is set
    event AccruedRewardsSet(uint8 rewardType, address indexed user, uint256 amount);

    /// @notice Emitted when the setAccruedRewardsForUsers function is locked
    event InitializeRewardAccruedLocked();

    /**
     * @notice Checks if caller is admin
     */
    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin");
        _;
    }

    /**
     * @notice Checks if caller is joetroller or admin
     */
    modifier onlyJoetrollerOrAdmin() {
        require(msg.sender == address(joetroller) || msg.sender == admin, "only joetroller or admin");
        _;
    }

    /**
     * @notice Checks that reward type is valid
     */
    modifier verifyRewardType(uint8 rewardType) {
        require(rewardType <= 1, "rewardType is invalid");
        _;
    }

    /**
     * @notice Initialize function, in 2 times to avoid redeploying joetroller
     * @dev first call is made by the deploy script, the second one by joeTroller
     * when calling `_setRewardDistributor`
     */
    function initialize() public {
        require(address(joetroller) == address(0), "already initialized");
        if (admin == address(0)) {
            admin = msg.sender;
        } else {
            joetroller = IJoetroller(msg.sender);
        }
    }

    /**
     * @notice Payable function needed to receive AVAX
     */
    function() external payable {}

    /*** User functions ***/

    /**
     * @notice Claim all the JOE/AVAX accrued by holder in all markets
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param holder The address to claim JOE/AVAX for
     */
    function claimReward(uint8 rewardType, address payable holder) external {
        _claimReward(rewardType, holder, joetroller.getAllMarkets(), true, true);
    }

    /**
     * @notice Claim all the JOE/AVAX accrued by holder in the specified markets
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param holder The address to claim JOE/AVAX for
     * @param jTokens The list of markets to claim JOE/AVAX in
     */
    function claimReward(
        uint8 rewardType,
        address payable holder,
        IJToken[] calldata jTokens
    ) external {
        _claimReward(rewardType, holder, jTokens, true, true);
    }

    /**
     * @notice Claim all JOE/AVAX accrued by the holders
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param holders The addresses to claim JOE/AVAX for
     * @param jTokens The list of markets to claim JOE/AVAX in
     * @param borrowers Whether or not to claim JOE/AVAX earned by borrowing
     * @param suppliers Whether or not to claim JOE/AVAX earned by supplying
     */
    function claimReward(
        uint8 rewardType,
        address payable[] calldata holders,
        IJToken[] calldata jTokens,
        bool borrowers,
        bool suppliers
    ) external {
        uint256 len = holders.length;
        for (uint256 i; i < len; i++) {
            _claimReward(rewardType, holders[i], jTokens, borrowers, suppliers);
        }
    }

    /**
     * @notice Returns the pending JOE/AVAX reward accrued by the holder
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param holder The address to check pending JOE/AVAX for
     * @return pendingReward The pending JOE/AVAX reward of that holder
     */
    function pendingReward(uint8 rewardType, address holder) external view returns (uint256) {
        return _pendingReward(rewardType, holder, joetroller.getAllMarkets());
    }

    /*** Joetroller Or Joe Distribution Admin ***/

    /**
     * @notice Refactored function to calc and rewards accounts supplier rewards
     * @param jToken The market to verify the mint against
     * @param supplier The supplier to be rewarded
     */
    function updateAndDistributeSupplierRewardsForToken(IJToken jToken, address supplier)
        external
        onlyJoetrollerOrAdmin
    {
        for (uint8 rewardType; rewardType <= 1; rewardType++) {
            _updateRewardSupplyIndex(rewardType, jToken);
            uint256 reward = _distributeSupplierReward(rewardType, jToken, supplier);
            rewardAccrued[rewardType][supplier] = rewardAccrued[rewardType][supplier].add(reward);
        }
    }

    /**
     * @notice Refactored function to calc and rewards accounts borrower rewards
     * @param jToken The market to verify the mint against
     * @param borrower Borrower to be rewarded
     * @param marketBorrowIndex Current index of the borrow market
     */
    function updateAndDistributeBorrowerRewardsForToken(
        IJToken jToken,
        address borrower,
        Exp calldata marketBorrowIndex
    ) external onlyJoetrollerOrAdmin {
        for (uint8 rewardType; rewardType <= 1; rewardType++) {
            _updateRewardBorrowIndex(rewardType, jToken, marketBorrowIndex.mantissa);
            uint256 reward = _distributeBorrowerReward(rewardType, jToken, borrower, marketBorrowIndex.mantissa);
            rewardAccrued[rewardType][borrower] = rewardAccrued[rewardType][borrower].add(reward);
        }
    }

    /*** Joe Distribution Admin ***/

    /**
     * @notice Set JOE/AVAX speed for a single market
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market whose reward speed to update
     * @param rewardSupplySpeed New reward supply speed for market
     * @param rewardBorrowSpeed New reward borrow speed for market
     */
    function setRewardSpeed(
        uint8 rewardType,
        IJToken jToken,
        uint256 rewardSupplySpeed,
        uint256 rewardBorrowSpeed
    ) external onlyAdmin verifyRewardType(rewardType) {
        _setRewardSupplySpeed(rewardType, jToken, rewardSupplySpeed);
        _setRewardBorrowSpeed(rewardType, jToken, rewardBorrowSpeed);
    }

    /**
     * @notice Transfer JOE/AVAX to the recipient
     * @dev Note: If there is not enough JOE, we do not perform the transfer at all.
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param recipient The address of the recipient to transfer JOE to
     * @param amount The amount of JOE to (possibly) transfer
     */
    function grantReward(
        uint8 rewardType,
        address payable recipient,
        uint256 amount
    ) external onlyAdmin verifyRewardType(rewardType) {
        uint256 amountLeft = _grantReward(rewardType, recipient, amount);
        require(amountLeft == 0, "insufficient joe for grant");
        emit RewardGranted(rewardType, recipient, amount);
    }

    /**
     * @notice Set the JOE token address
     * @param _joe The JOE token address
     */
    function setJoe(EIP20Interface _joe) external onlyAdmin {
        require(address(joe) == address(0), "joe already initialized");
        joe = _joe;
        emit JoeSet(_joe);
    }

    /**
     * @notice Set the admin
     * @param newAdmin The address of the new admin
     */
    function setAdmin(address newAdmin) external onlyAdmin {
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminTransferred(oldAdmin, newAdmin);
    }

    /**
     * @notice Initialize rewardAccrued of users for the first time
     * @dev We initialize rewardAccrued to transfer pending rewards from previous rewarder to this one.
     * Must call lockInitializeRewardAccrued() after initialization.
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param users The list of addresses of users that did not claim their rewards
     * @param amounts The list of amounts of unclaimed rewards
     */
    function initializeRewardAccrued(
        uint8 rewardType,
        address[] calldata users,
        uint256[] calldata amounts
    ) external onlyAdmin verifyRewardType(rewardType) {
        require(!isInitializeRewardAccruedLocked, "initializeRewardAccrued is locked");
        uint256 len = users.length;
        require(len == amounts.length, "length mismatch");
        for (uint256 i; i < len; i++) {
            address user = users[i];
            uint256 amount = amounts[i];
            rewardAccrued[rewardType][user] = amount;
            emit AccruedRewardsSet(rewardType, user, amount);
        }
    }

    /**
     * @notice Lock the initializeRewardAccrued function
     */
    function lockInitializeRewardAccrued() external onlyAdmin {
        isInitializeRewardAccruedLocked = true;
        emit InitializeRewardAccruedLocked();
    }

    /*** Private functions ***/

    /**
     * @notice Set JOE/AVAX supply speed
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market whose speed to update
     * @param newRewardSupplySpeed New JOE or AVAX supply speed for market
     */
    function _setRewardSupplySpeed(
        uint8 rewardType,
        IJToken jToken,
        uint256 newRewardSupplySpeed
    ) private {
        // Handle new supply speed
        uint256 currentRewardSupplySpeed = rewardSupplySpeeds[rewardType][address(jToken)];

        if (currentRewardSupplySpeed != 0) {
            // note that JOE speed could be set to 0 to halt liquidity rewards for a market
            _updateRewardSupplyIndex(rewardType, jToken);
        } else if (newRewardSupplySpeed != 0) {
            // Add the JOE market
            require(joetroller.isMarketListed(address(jToken)), "reward market is not listed");
            rewardSupplyState[rewardType][address(jToken)].timestamp = _safe48(_getBlockTimestamp());
        }

        if (currentRewardSupplySpeed != newRewardSupplySpeed) {
            rewardSupplySpeeds[rewardType][address(jToken)] = newRewardSupplySpeed;
            emit RewardSupplySpeedUpdated(rewardType, jToken, newRewardSupplySpeed);
        }
    }

    /**
     * @notice Set JOE/AVAX borrow speed
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market whose speed to update
     * @param newRewardBorrowSpeed New JOE or AVAX borrow speed for market
     */
    function _setRewardBorrowSpeed(
        uint8 rewardType,
        IJToken jToken,
        uint256 newRewardBorrowSpeed
    ) private {
        // Handle new borrow speed
        uint256 currentRewardBorrowSpeed = rewardBorrowSpeeds[rewardType][address(jToken)];

        if (currentRewardBorrowSpeed != 0) {
            // note that JOE speed could be set to 0 to halt liquidity rewards for a market
            _updateRewardBorrowIndex(rewardType, jToken, jToken.borrowIndex());
        } else if (newRewardBorrowSpeed != 0) {
            // Add the JOE market
            require(joetroller.isMarketListed(address(jToken)), "reward market is not listed");
            rewardBorrowState[rewardType][address(jToken)].timestamp = _safe48(_getBlockTimestamp());
        }

        if (currentRewardBorrowSpeed != newRewardBorrowSpeed) {
            rewardBorrowSpeeds[rewardType][address(jToken)] = newRewardBorrowSpeed;
            emit RewardBorrowSpeedUpdated(rewardType, jToken, newRewardBorrowSpeed);
        }
    }

    /**
     * @notice Accrue JOE/AVAX to the market by updating the supply index
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market whose supply index to update
     */
    function _updateRewardSupplyIndex(uint8 rewardType, IJToken jToken) private verifyRewardType(rewardType) {
        (uint208 supplyIndex, bool update) = _getUpdatedRewardSupplyIndex(rewardType, jToken);

        if (update) {
            rewardSupplyState[rewardType][address(jToken)].index = supplyIndex;
        }
        rewardSupplyState[rewardType][address(jToken)].timestamp = _safe48(_getBlockTimestamp());
    }

    /**
     * @notice Accrue JOE/AVAX to the market by updating the borrow index
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market whose borrow index to update
     * @param marketBorrowIndex Current index of the borrow market
     */
    function _updateRewardBorrowIndex(
        uint8 rewardType,
        IJToken jToken,
        uint256 marketBorrowIndex
    ) private verifyRewardType(rewardType) {
        (uint208 borrowIndex, bool update) = _getUpdatedRewardBorrowIndex(rewardType, jToken, marketBorrowIndex);

        if (update) {
            rewardBorrowState[rewardType][address(jToken)].index = borrowIndex;
        }
        rewardBorrowState[rewardType][address(jToken)].timestamp = _safe48(_getBlockTimestamp());
    }

    /**
     * @notice Calculate JOE/AVAX accrued by a supplier
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute JOE/AVAX to
     * @return supplierReward The JOE/AVAX amount of reward from market
     */
    function _distributeSupplierReward(
        uint8 rewardType,
        IJToken jToken,
        address supplier
    ) private verifyRewardType(rewardType) returns (uint208) {
        uint256 supplyIndex = rewardSupplyState[rewardType][address(jToken)].index;
        uint256 supplierIndex = rewardSupplierIndex[rewardType][address(jToken)][supplier];

        uint256 deltaIndex = supplyIndex.sub(supplierIndex);
        uint256 supplierAmount = jToken.balanceOf(supplier);
        uint208 supplierReward = _safe208(supplierAmount.mul(deltaIndex).div(doubleScale));

        if (supplyIndex != supplierIndex) {
            rewardSupplierIndex[rewardType][address(jToken)][supplier] = supplyIndex;
        }
        emit DistributedSupplierReward(rewardType, jToken, supplier, supplierReward, supplyIndex);
        return supplierReward;
    }

    /**
     * @notice Calculate JOE/AVAX accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute JOE/AVAX to
     * @param marketBorrowIndex Current index of the borrow market
     * @return borrowerReward The JOE/AVAX amount of reward from market
     */
    function _distributeBorrowerReward(
        uint8 rewardType,
        IJToken jToken,
        address borrower,
        uint256 marketBorrowIndex
    ) private verifyRewardType(rewardType) returns (uint208) {
        uint256 borrowIndex = rewardBorrowState[rewardType][address(jToken)].index;
        uint256 borrowerIndex = rewardBorrowerIndex[rewardType][address(jToken)][borrower];

        uint256 deltaIndex = borrowIndex.sub(borrowerIndex);
        uint256 borrowerAmount = jToken.borrowBalanceStored(borrower).mul(expScale).div(marketBorrowIndex);
        uint208 borrowerReward = _safe208(borrowerAmount.mul(deltaIndex).div(doubleScale));

        if (borrowIndex != borrowerIndex) {
            rewardBorrowerIndex[rewardType][address(jToken)][borrower] = borrowIndex;
        }
        emit DistributedBorrowerReward(rewardType, jToken, borrower, borrowerReward, borrowIndex);
        return borrowerReward;
    }

    /**
     * @notice Claim all JOE/AVAX accrued by the holders
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param holder The address to claim JOE/AVAX for
     * @param jTokens The list of markets to claim JOE/AVAX in
     * @param borrower Whether or not to claim JOE/AVAX earned by borrowing
     * @param supplier Whether or not to claim JOE/AVAX earned by supplying
     */
    function _claimReward(
        uint8 rewardType,
        address payable holder,
        IJToken[] memory jTokens,
        bool borrower,
        bool supplier
    ) private verifyRewardType(rewardType) {
        uint256 rewards = rewardAccrued[rewardType][holder];
        uint256 len = jTokens.length;
        for (uint256 i; i < len; i++) {
            IJToken jToken = jTokens[i];
            require(joetroller.isMarketListed(address(jToken)), "market must be listed");

            if (borrower) {
                uint256 marketBorrowIndex = jToken.borrowIndex();
                _updateRewardBorrowIndex(rewardType, jToken, marketBorrowIndex);
                uint256 reward = _distributeBorrowerReward(rewardType, jToken, holder, marketBorrowIndex);
                rewards = rewards.add(reward);
            }
            if (supplier) {
                _updateRewardSupplyIndex(rewardType, jToken);
                uint256 reward = _distributeSupplierReward(rewardType, jToken, holder);
                rewards = rewards.add(reward);
            }
        }
        if (rewards != 0) {
            rewardAccrued[rewardType][holder] = _grantReward(rewardType, holder, rewards);
        }
    }

    /**
     * @notice Returns the pending JOE/AVAX reward for holder
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param holder The address to return the pending JOE/AVAX reward for
     * @param jTokens The markets to return the pending JOE/AVAX reward in
     * @return uint256 The JOE/AVAX reward for that user
     */
    function _pendingReward(
        uint8 rewardType,
        address holder,
        IJToken[] memory jTokens
    ) private view verifyRewardType(rewardType) returns (uint256) {
        uint256 rewards = rewardAccrued[rewardType][holder];
        uint256 len = jTokens.length;

        for (uint256 i; i < len; i++) {
            IJToken jToken = jTokens[i];

            uint256 supplierReward = _pendingSupplyReward(rewardType, jToken, holder);
            uint256 borrowerReward = _pendingBorrowReward(rewardType, jToken, holder, jToken.borrowIndex());

            rewards = rewards.add(supplierReward).add(borrowerReward);
        }

        return rewards;
    }

    /**
     * @notice Returns the pending JOE/AVAX reward for a supplier on a market
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param holder The address to return the pending JOE/AVAX reward for
     * @param jToken The market to return the pending JOE/AVAX reward in
     * @return uint256 The JOE/AVAX reward for that user
     */
    function _pendingSupplyReward(
        uint8 rewardType,
        IJToken jToken,
        address holder
    ) private view returns (uint256) {
        (uint256 supplyIndex, ) = _getUpdatedRewardSupplyIndex(rewardType, jToken);
        uint256 supplierIndex = rewardSupplierIndex[rewardType][address(jToken)][holder];

        uint256 deltaIndex = supplyIndex.sub(supplierIndex);
        uint256 supplierAmount = jToken.balanceOf(holder);
        return supplierAmount.mul(deltaIndex).div(doubleScale);
    }

    /**
     * @notice Returns the pending JOE/AVAX reward for a borrower on a market
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param holder The address to return the pending JOE/AVAX reward for
     * @param jToken The market to return the pending JOE/AVAX reward in
     * @param marketBorrowIndex Current index of the borrow market
     * @return uint256 The JOE/AVAX reward for that user
     */
    function _pendingBorrowReward(
        uint8 rewardType,
        IJToken jToken,
        address holder,
        uint256 marketBorrowIndex
    ) private view returns (uint256) {
        (uint256 borrowIndex, ) = _getUpdatedRewardBorrowIndex(rewardType, jToken, marketBorrowIndex);
        uint256 borrowerIndex = rewardBorrowerIndex[rewardType][address(jToken)][holder];

        uint256 deltaIndex = borrowIndex.sub(borrowerIndex);
        uint256 borrowerAmount = jToken.borrowBalanceStored(holder).mul(expScale).div(marketBorrowIndex);

        return borrowerAmount.mul(deltaIndex).div(doubleScale);
    }

    /**
     * @notice Returns the updated reward supply index
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market whose supply index to update
     * @return uint208 The updated supply state index
     * @return bool If the stored supply state index needs to be updated
     */
    function _getUpdatedRewardSupplyIndex(uint8 rewardType, IJToken jToken) private view returns (uint208, bool) {
        RewardMarketState memory supplyState = rewardSupplyState[rewardType][address(jToken)];
        uint256 supplySpeed = rewardSupplySpeeds[rewardType][address(jToken)];
        uint256 deltaTimestamps = _getBlockTimestamp().sub(supplyState.timestamp);

        if (deltaTimestamps != 0 && supplySpeed != 0) {
            uint256 supplyTokens = jToken.totalSupply();
            if (supplyTokens != 0) {
                uint256 reward = deltaTimestamps.mul(supplySpeed);
                supplyState.index = _safe208(uint256(supplyState.index).add(reward.mul(doubleScale).div(supplyTokens)));
                return (supplyState.index, true);
            }
        }
        return (supplyState.index, false);
    }

    /**
     * @notice Returns the updated reward borrow index
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param jToken The market whose borrow index to update
     * @param marketBorrowIndex Current index of the borrow market
     * @return uint208 The updated borrow state index
     * @return bool If the stored borrow state index needs to be updated
     */
    function _getUpdatedRewardBorrowIndex(
        uint8 rewardType,
        IJToken jToken,
        uint256 marketBorrowIndex
    ) private view returns (uint208, bool) {
        RewardMarketState memory borrowState = rewardBorrowState[rewardType][address(jToken)];
        uint256 borrowSpeed = rewardBorrowSpeeds[rewardType][address(jToken)];
        uint256 deltaTimestamps = _getBlockTimestamp().sub(borrowState.timestamp);

        if (deltaTimestamps != 0 && borrowSpeed != 0) {
            uint256 totalBorrows = jToken.totalBorrows();
            uint256 borrowAmount = totalBorrows.mul(expScale).div(marketBorrowIndex);
            if (borrowAmount != 0) {
                uint256 reward = deltaTimestamps.mul(borrowSpeed);
                borrowState.index = _safe208(uint256(borrowState.index).add(reward.mul(doubleScale).div(borrowAmount)));
                return (borrowState.index, true);
            }
        }
        return (borrowState.index, false);
    }

    /**
     * @notice Transfer JOE/AVAX to the user
     * @dev Note: If there is not enough JOE/AVAX, we do not perform the transfer at all.
     * @param rewardType 0 = JOE, 1 = AVAX.
     * @param user The address of the user to transfer JOE/AVAX to
     * @param amount The amount of JOE/AVAX to (possibly) transfer
     * @return uint256 The amount of JOE/AVAX which was NOT transferred to the user
     */
    function _grantReward(
        uint8 rewardType,
        address payable user,
        uint256 amount
    ) private returns (uint256) {
        if (amount == 0) {
            return 0;
        }
        if (rewardType == 0) {
            uint256 joeRemaining = joe.balanceOf(address(this));
            if (amount <= joeRemaining) {
                joe.transfer(user, amount);
                return 0;
            }
        } else if (rewardType == 1) {
            uint256 avaxRemaining = address(this).balance;
            if (amount <= avaxRemaining) {
                user.transfer(amount);
                return 0;
            }
        }
        return amount;
    }

    /**
     * @notice Function to get the current timestamp
     * @return uint256 The current timestamp
     */
    function _getBlockTimestamp() private view returns (uint256) {
        return block.timestamp;
    }

    /**
     * @notice Return x written on 48 bits while asserting that x doesn't exceed 48 bits
     * @param x The value
     * @return uint48 The value x on 48 bits
     */
    function _safe48(uint256 x) private pure returns (uint48) {
        require(x < 2**48, "exceeds 48 bits");
        return uint48(x);
    }

    /**
     * @notice Return x written on 208 bits while asserting that x doesn't exceed 208 bits
     * @param x The value
     * @return uint208 The value x on 208 bits
     */
    function _safe208(uint256 x) private pure returns (uint208) {
        require(x < 2**208, "exceeds 208 bits");
        return uint208(x);
    }
}
