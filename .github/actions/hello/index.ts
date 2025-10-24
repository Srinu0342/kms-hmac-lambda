import core from '@actions/core';
import github from '@actions/github';

try {
  core.debug('Debugging is enabled'); // this is equivalent to echo "::debug::Debugging is enabled" in the workflow file

  const name = core.getInput('guest_name');

  console.log(`Hello, ${name}!`);

  core.info(`Hello, ${name}!`);

  const time = new Date();

  core.setOutput('greeting_time', time.toTimeString());
} catch (error) {
  console.error(error);
  core.setFailed((error as any).message);
}
