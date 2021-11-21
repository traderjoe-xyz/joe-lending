pragma solidity ^0.5.16;

import "./ERC20.sol";

contract JoeToken is StandardToken(0, "JoeToken", 18, "JOE") {
    function mint(address _to, uint256 _amount) public returns (bool) {
        totalSupply = totalSupply.add(_amount);
        balanceOf[_to] = balanceOf[_to].add(_amount);
        return true;
    }
}

// MasterChef is the mock (modified and simplified) contract for testing.
// Ref: https://etherscan.io/address/0xc2edad668740f1aa35e4d8f227fb8e17dca888cd#code
contract MasterChef {
    using SafeMath for uint256;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of JOEs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accJoePerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accJoePerShare` (and `lastRewardTimestamp`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        ERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. JOEs to distribute per block.
        uint256 lastRewardTimestamp; // Last block number that JOEs distribution occurs.
        uint256 accJoePerShare; // Accumulated JOEs per share, times 1e12. See below.
    }

    JoeToken public joe;
    // We gave user 1e18 JOE pre block for testing efficiency.
    uint256 public constant joePerSec = 1e18;

    PoolInfo[] public poolInfo;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    uint256 public totalAllocPoint = 0;

    uint256 blockTimestamp = 10000;

    constructor(JoeToken _joe) public {
        joe = _joe;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(uint256 _allocPoint, ERC20 _lpToken) public {
        uint256 lastRewardTimestamp = blockTimestamp;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardTimestamp: lastRewardTimestamp,
                accJoePerShare: 0
            })
        );
    }

    // View function to see pending JOEs on frontend.
    function pendingJoe(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accJoePerShare = pool.accJoePerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (blockTimestamp > pool.lastRewardTimestamp && lpSupply != 0) {
            uint256 joeReward = joePerSec.mul(pool.allocPoint).div(totalAllocPoint);
            accJoePerShare = accJoePerShare.add(joeReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accJoePerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (blockTimestamp <= pool.lastRewardTimestamp) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardTimestamp = blockTimestamp;
            return;
        }
        uint256 joeReward = joePerSec.mul(pool.allocPoint).div(totalAllocPoint);
        joe.mint(address(this), joeReward);
        pool.accJoePerShare = pool.accJoePerShare.add(joeReward.mul(1e12).div(lpSupply));
        pool.lastRewardTimestamp = blockTimestamp;
    }

    // Deposit LP tokens to MasterChef for JOE allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accJoePerShare).div(1e12).sub(user.rewardDebt);
            safeJoeTransfer(msg.sender, pending);
        }
        pool.lpToken.transferFrom(address(msg.sender), address(this), _amount);
        user.amount = user.amount.add(_amount);
        user.rewardDebt = user.amount.mul(pool.accJoePerShare).div(1e12);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accJoePerShare).div(1e12).sub(user.rewardDebt);
        safeJoeTransfer(msg.sender, pending);
        user.amount = user.amount.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accJoePerShare).div(1e12);
        pool.lpToken.transfer(address(msg.sender), _amount);
    }

    // Safe joe transfer function, just in case if rounding error causes pool to not have enough JOEs.
    function safeJoeTransfer(address _to, uint256 _amount) internal {
        uint256 joeBal = joe.balanceOf(address(this));
        if (_amount > joeBal) {
            joe.transfer(_to, joeBal);
        } else {
            joe.transfer(_to, _amount);
        }
    }

    // Set user amount helper function.
    function harnessSetUserAmount(
        uint256 _pid,
        address _user,
        uint256 _amount
    ) public {
        userInfo[_pid][_user].amount = _amount;
    }

    // Increase block number helper function.
    function harnessFastForward(uint256 secs) public {
        blockTimestamp += secs;
    }
}
