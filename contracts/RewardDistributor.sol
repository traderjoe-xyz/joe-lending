// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./EIP20Interface.sol";
import "./Exponential.sol";
import "./JToken.sol";
import "./SafeMath.sol";

interface IJoetroller {
    function isMarketListed(address jTokenAddress) external view returns (bool);

    function getAllMarkets() external view returns (JToken[] memory);

    function rewardDistributor() external view returns (address);
}

interface IRewarder {
    function claimReward(uint8 rewardType, address payable holder) external;

    function rewardAccrued(uint8 rewardType, address holder) external view returns (uint256);
}

contract RewardDistributorStorage {
    /// @notice Administrator for this contract
    address public admin;

    /// @notice Active brains of Unitroller
    IJoetroller public joetroller;

    struct RewardMarketState {
        /// @notice The market's last updated joeBorrowIndex or joeSupplyIndex
        uint224 index;
        /// @notice The timestamp number the index was last updated at
        uint32 timestamp;
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

    /// @notice If user claimed JOE/AVAX from the old rewarder
    mapping(uint8 => mapping(address => bool)) public claimedFromOldRewarder;

    /// @notice JOE token contract address
    EIP20Interface public joe;

    /// @notice The previous rewarder
    IRewarder oldRewarder;
}

contract RewardDistributor is RewardDistributorStorage, Exponential {
    using SafeMath for uint256;

    /// @notice Emitted when a new reward supply speed is calculated for a market
    event RewardSupplySpeedUpdated(uint8 rewardType, address indexed jToken, uint256 newSpeed);

    /// @notice Emitted when a new reward borrow speed is calculated for a market
    event RewardBorrowSpeedUpdated(uint8 rewardType, address indexed jToken, uint256 newSpeed);

    /// @notice Emitted when JOE/AVAX is distributed to a supplier
    event DistributedSupplierReward(
        uint8 rewardType,
        JToken indexed jToken,
        address indexed supplier,
        uint256 rewardDelta,
        uint256 rewardSupplyIndex
    );

    /// @notice Emitted when JOE/AVAX is distributed to a borrower
    event DistributedBorrowerReward(
        uint8 rewardType,
        JToken indexed jToken,
        address indexed borrower,
        uint256 rewardDelta,
        uint256 rewardBorrowIndex
    );

    /// @notice Emitted when JOE is granted by admin
    event RewardGranted(uint8 rewardType, address recipient, uint256 amount);

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
        require(msg.sender == address(joetroller) || msg.sender == admin, "only joe troller or admin");
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
            oldRewarder = IRewarder(joetroller.rewardDistributor());
        }
    }

    /**
     * @notice payable function needed to receive AVAX
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
        JToken[] calldata jTokens
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
        JToken[] calldata jTokens,
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
    function updateAndDistributeSupplierRewardsForToken(address jToken, address supplier)
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
     * @notice Refactored function to calc and rewards accounts supplier rewards
     * @param jToken The market to verify the mint against
     * @param borrower Borrower to be rewarded
     * @param marketBorrowIndex Current index of the borrow market
     */
    function updateAndDistributeBorrowerRewardsForToken(
        address jToken,
        address borrower,
        Exp calldata marketBorrowIndex
    ) external onlyJoetrollerOrAdmin {
        for (uint8 rewardType = 0; rewardType <= 1; rewardType++) {
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
        JToken jToken,
        uint256 rewardSupplySpeed,
        uint256 rewardBorrowSpeed
    ) external onlyAdmin verifyRewardType(rewardType) {
        _setRewardSupplySpeed(rewardType, address(jToken), rewardSupplySpeed);
        _setRewardBorrowSpeed(rewardType, address(jToken), rewardBorrowSpeed);
    }

    /**
     * @notice Transfer JOE to the recipient
     * @dev Note: If there is not enough JOE, we do not perform the transfer at all.
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param recipient The address of the recipient to transfer JOE to
     * @param amount The amount of JOE to (possibly) transfer
     */
    function grantReward(
        uint8 rewardType,
        address payable recipient,
        uint256 amount
    ) external onlyAdmin {
        uint256 amountLeft = _grantReward(rewardType, recipient, amount);
        require(amountLeft == 0, "insufficient joe for grant");
        emit RewardGranted(rewardType, recipient, amount);
    }

    /**
     * @notice Set the JOE token address
     * @param _joe The JOE token address
     */
    function setJoe(EIP20Interface _joe) external onlyAdmin {
        joe = _joe;
    }

    /**
     * @notice Set the Joetroller address
     * @param _joetroller The Joetroller address
     */
    function setJoetroller(IJoetroller _joetroller) external onlyAdmin {
        joetroller = _joetroller;
    }

    /**
     * @notice Set the admin
     * @param _newAdmin The address of the new admin
     */
    function setAdmin(address _newAdmin) external onlyAdmin {
        admin = _newAdmin;
    }

    /*** Private functions ***/

    /**
     * @notice Set JOE/AVAX supply speed
     * @param rewardType 0: JOE, 1: AVAX
     * @param jToken The market whose speed to update
     * @param newRewardSupplySpeed New JOE or AVAX supply speed for market
     */
    function _setRewardSupplySpeed(
        uint8 rewardType,
        address jToken,
        uint256 newRewardSupplySpeed
    ) private {
        // Handle new supply speed
        uint256 currentRewardSupplySpeed = rewardSupplySpeeds[rewardType][jToken];

        if (currentRewardSupplySpeed != 0) {
            // note that JOE speed could be set to 0 to halt liquidity rewards for a market
            _updateRewardSupplyIndex(rewardType, jToken);
        } else if (newRewardSupplySpeed != 0) {
            // Add the JOE market
            require(joetroller.isMarketListed(jToken), "reward market is not listed");
            rewardSupplyState[rewardType][jToken].timestamp = _safe32(_getBlockTimestamp());
        }

        if (currentRewardSupplySpeed != newRewardSupplySpeed) {
            rewardSupplySpeeds[rewardType][jToken] = newRewardSupplySpeed;
            emit RewardSupplySpeedUpdated(rewardType, jToken, newRewardSupplySpeed);
        }
    }

    /**
     * @notice Set JOE/AVAX borrow speed
     * @param rewardType 0: JOE, 1: AVAX
     * @param jToken The market whose speed to update
     * @param newRewardBorrowSpeed New JOE or AVAX borrow speed for market
     */
    function _setRewardBorrowSpeed(
        uint8 rewardType,
        address jToken,
        uint256 newRewardBorrowSpeed
    ) private {
        // Handle new borrow speed
        uint256 currentRewardBorrowSpeed = rewardBorrowSpeeds[rewardType][jToken];

        if (currentRewardBorrowSpeed != 0) {
            // note that JOE speed could be set to 0 to halt liquidity rewards for a market
            _updateRewardBorrowIndex(rewardType, jToken, JToken(jToken).borrowIndex());
        } else if (newRewardBorrowSpeed != 0) {
            // Add the JOE market
            require(joetroller.isMarketListed(jToken), "reward market is not listed");
            rewardBorrowState[rewardType][jToken].timestamp = _safe32(_getBlockTimestamp());
        }

        if (currentRewardBorrowSpeed != newRewardBorrowSpeed) {
            rewardBorrowSpeeds[rewardType][jToken] = newRewardBorrowSpeed;
            emit RewardBorrowSpeedUpdated(rewardType, jToken, newRewardBorrowSpeed);
        }
    }

    /**
     * @notice Accrue JOE/AVAX to the market by updating the supply index
     * @param rewardType 0: JOE, 1: AVAX
     * @param jToken The market whose supply index to update
     */
    function _updateRewardSupplyIndex(uint8 rewardType, address jToken) private verifyRewardType(rewardType) {
        (uint224 supplyIndex, bool update) = _getUpdatedRewardSupplyIndex(rewardType, jToken);

        if (update) {
            rewardSupplyState[rewardType][jToken].index = supplyIndex;
        }
        rewardSupplyState[rewardType][jToken].timestamp = _safe32(_getBlockTimestamp());
    }

    /**
     * @notice Accrue JOE/AVAX to the market by updating the borrow index
     * @param rewardType 0: JOE, 1: AVAX
     * @param jToken The market whose borrow index to update
     * @param marketBorrowIndex Current index of the borrow market
     */
    function _updateRewardBorrowIndex(
        uint8 rewardType,
        address jToken,
        uint256 marketBorrowIndex
    ) private verifyRewardType(rewardType) {
        (uint224 borrowIndex, bool update) = _getUpdatedRewardBorrowIndex(rewardType, jToken, marketBorrowIndex);

        if (update) {
            rewardBorrowState[rewardType][jToken].index = borrowIndex;
        }
        rewardBorrowState[rewardType][jToken].timestamp = _safe32(_getBlockTimestamp());
    }

    /**
     * @notice Calculate JOE/AVAX accrued by a supplier
     * @param rewardType 0: JOE, 1: AVAX
     * @param jToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute JOE/AVAX to
     * @return supplierReward The JOE/AVAX amount of reward from market
     */
    function _distributeSupplierReward(
        uint8 rewardType,
        address jToken,
        address supplier
    ) private verifyRewardType(rewardType) returns (uint256) {
        uint256 supplyIndex = rewardSupplyState[rewardType][jToken].index;
        uint256 supplierIndex = rewardSupplierIndex[rewardType][jToken][supplier];

        uint256 deltaIndex = supplyIndex.sub(supplierIndex);
        uint256 supplierAmount = JToken(jToken).balanceOf(supplier);
        uint256 supplierReward = supplierAmount.mul(deltaIndex).div(doubleScale);

        if (supplyIndex != supplierIndex) {
            rewardSupplierIndex[rewardType][jToken][supplier] = supplyIndex;
        }
        emit DistributedSupplierReward(rewardType, JToken(jToken), supplier, supplierReward, supplyIndex);
        return supplierReward;
    }

    /**
     * @notice Calculate JOE/AVAX accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param rewardType 0: JOE, 1: AVAX
     * @param jToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute JOE/AVAX to
     * @param marketBorrowIndex Current index of the borrow market
     * @return borrowerReward The JOE/AVAX amount of reward from market
     */
    function _distributeBorrowerReward(
        uint8 rewardType,
        address jToken,
        address borrower,
        uint256 marketBorrowIndex
    ) private verifyRewardType(rewardType) returns (uint256) {
        uint256 borrowIndex = rewardBorrowState[rewardType][jToken].index;
        uint256 borrowerIndex = rewardBorrowerIndex[rewardType][jToken][borrower];

        uint256 deltaIndex = borrowIndex.sub(borrowerIndex);
        uint256 borrowerAmount = JToken(jToken).borrowBalanceStored(borrower).mul(expScale).div(marketBorrowIndex);
        uint256 borrowerReward = borrowerAmount.mul(deltaIndex).div(doubleScale);

        if (borrowIndex != borrowerIndex) {
            rewardBorrowerIndex[rewardType][jToken][borrower] = borrowIndex;
        }
        emit DistributedBorrowerReward(rewardType, JToken(jToken), borrower, borrowerReward, borrowIndex);
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
        JToken[] memory jTokens,
        bool borrower,
        bool supplier
    ) private verifyRewardType(rewardType) {
        uint256 rewards = rewardAccrued[rewardType][holder];
        if (!claimedFromOldRewarder[rewardType][holder]) {
            // claim from previous rewarder
            oldRewarder.claimReward(rewardType, holder);
            rewards = rewards.add(oldRewarder.rewardAccrued(rewardType, holder));
            claimedFromOldRewarder[rewardType][holder] = true;
        }

        uint256 len = jTokens.length;
        for (uint256 i; i < len; i++) {
            JToken jToken = jTokens[i];
            require(joetroller.isMarketListed(address(jToken)), "market must be listed");

            if (borrower) {
                uint256 marketBorrowIndex = jToken.borrowIndex();
                _updateRewardBorrowIndex(rewardType, address(jToken), marketBorrowIndex);
                uint256 reward = _distributeBorrowerReward(rewardType, address(jToken), holder, marketBorrowIndex);
                rewards = rewards.add(reward);
            }
            if (supplier) {
                _updateRewardSupplyIndex(rewardType, address(jToken));
                uint256 reward = _distributeSupplierReward(rewardType, address(jToken), holder);
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
     * @param jTokens The market to return the pending JOE/AVAX reward in
     * @return uint256 The JOE/AVAX reward for that user
     */
    function _pendingReward(
        uint8 rewardType,
        address holder,
        JToken[] memory jTokens
    ) private view verifyRewardType(rewardType) returns (uint256) {
        uint256 rewards = rewardAccrued[rewardType][holder];
        uint256 len = jTokens.length;

        for (uint256 i; i < len; i++) {
            address jToken = address(jTokens[i]);

            uint256 supplierReward = _pendingSupplyReward(rewardType, jToken, holder);
            uint256 borrowerReward = _pendingBorrowReward(rewardType, jToken, holder, JToken(jToken).borrowIndex());

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
        address jToken,
        address holder
    ) private view returns (uint256) {
        (uint256 supplyIndex, ) = _getUpdatedRewardSupplyIndex(rewardType, jToken);
        uint256 supplierIndex = rewardSupplierIndex[rewardType][jToken][holder];

        uint256 deltaIndex = supplyIndex.sub(supplierIndex);
        uint256 supplierAmount = JToken(jToken).balanceOf(holder);
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
        address jToken,
        address holder,
        uint256 marketBorrowIndex
    ) private view returns (uint256) {
        (uint256 borrowIndex, ) = _getUpdatedRewardBorrowIndex(rewardType, jToken, marketBorrowIndex);
        uint256 borrowerIndex = rewardBorrowerIndex[rewardType][jToken][holder];

        uint256 deltaIndex = borrowIndex.sub(borrowerIndex);
        uint256 borrowerAmount = JToken(jToken).borrowBalanceStored(holder).mul(expScale).div(marketBorrowIndex);

        return borrowerAmount.mul(deltaIndex).div(doubleScale);
    }

    /**
     * @notice Returns the updated reward supply index
     * @param rewardType 0: JOE, 1: AVAX
     * @param jToken The market whose supply index to update
     * @return uint224 The updated supply state index
     * @return bool If the stored supply state index needs to be updated
     */
    function _getUpdatedRewardSupplyIndex(uint8 rewardType, address jToken) private view returns (uint224, bool) {
        RewardMarketState memory supplyState = rewardSupplyState[rewardType][jToken];
        uint256 supplySpeed = rewardSupplySpeeds[rewardType][jToken];
        uint256 deltaTimestamps = _getBlockTimestamp().sub(supplyState.timestamp);

        if (deltaTimestamps != 0) {
            if (supplySpeed != 0) {
                uint256 supplyTokens = JToken(jToken).totalSupply();
                if (supplyTokens != 0) {
                    uint256 reward = deltaTimestamps.mul(supplySpeed);
                    supplyState.index = _safe224(
                        uint256(supplyState.index).add(reward.mul(doubleScale).div(supplyTokens))
                    );
                    return (supplyState.index, true);
                }
            }
        }
        return (supplyState.index, false);
    }

    /**
     * @notice Returns the updated reward borrow index
     * @param rewardType 0: JOE, 1: AVAX
     * @param jToken The market whose borrow index to update
     * @param marketBorrowIndex Current index of the borrow market
     * @return uint224 The updated borrow state index
     * @return bool If the stored borrow state index needs to be updated
     */
    function _getUpdatedRewardBorrowIndex(
        uint8 rewardType,
        address jToken,
        uint256 marketBorrowIndex
    ) private view returns (uint224, bool) {
        RewardMarketState memory borrowState = rewardBorrowState[rewardType][jToken];
        uint256 borrowSpeed = rewardBorrowSpeeds[rewardType][jToken];
        uint256 deltaTimestamps = _getBlockTimestamp().sub(borrowState.timestamp);

        if (deltaTimestamps != 0) {
            if (borrowSpeed != 0) {
                uint256 totalBorrows = JToken(jToken).totalBorrows();
                uint256 borrowAmount = totalBorrows.mul(expScale).div(marketBorrowIndex);
                if (borrowAmount != 0) {
                    uint256 reward = deltaTimestamps.mul(borrowSpeed);
                    borrowState.index = _safe224(
                        uint256(borrowState.index).add(reward.mul(doubleScale).div(borrowAmount))
                    );
                    return (borrowState.index, true);
                }
            }
            borrowState.timestamp = _safe32(_getBlockTimestamp());
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
     * @notice Return x written on 32 bits while asserting that x doesn't exceed 32 bits
     * @param x The value
     * @return uint32 The value x on 32 bits
     */
    function _safe32(uint256 x) private pure returns (uint32) {
        require(x < 2**32, "exceeds 32 bits");
        return uint32(x);
    }

    /**
     * @notice Return x written on 224 bits while asserting that x doesn't exceed 224 bits
     * @param x The value
     * @return uint224 The value x on 224 bits
     */
    function _safe224(uint256 x) private pure returns (uint224) {
        require(x < 2**224, "exceeds 224 bits");
        return uint224(x);
    }
}
