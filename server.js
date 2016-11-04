const exec = require('child_process').exec
const Github = require('octonode')
const download = require('download-package-tarball')
const bodyParser = require('body-parser')
const server = require('express')()

const github = Github.client(process.env.GITHUB_TOKEN)

server.use(bodyParser.json())

server.post('/', (req, res) => {
  const {number, pull_request, repository: repo} = req.body
  const {user: {login}, title, head} = pull_request

  let {action} = req.body
  if (action === 'synchronize') action = 'bumped'

  console.log(`> PR #${number} "${title}" ${action} by @${login}`)
  console.log(`> Deploying ${repo.full_name}/tree/${head.ref}#${head.sha}`)

  console.log('> Synching commit…')

  github.repo(repo.full_name)
  .archive('tarball', head.sha, (err, link) => {
    if (err || !link) return res.sendStatus(500)

    download({url: link, dir: 'deploys'})
    .then(() => {
      console.log('> Synch complete')
      console.log('> Initializing deploy…')

      const cwd = `deploys/${repo.name}`

      const nowProc = exec(`now`, {cwd: cwd})

      let host

      nowProc.stdout.on('data', data => {
        host = data.replace('https://','')
        console.log('> Deploying to host', host)
      })

      nowProc.on('close', code => {
        if (code === 1) {
          console.log(`> Deploy failed`)
          return false
        }

        console.log(`> Deploy complete`)
        console.log(`> Aliasing host…`)
        const finalHost = `${repo.name}-${head.ref}.now.sh`

        const aliasCmd = `now alias set ${host} ${finalHost}`
        const aliasProc = exec(aliasCmd, {cwd: cwd})

        aliasProc.on('close', code => {
          console.log(`> Ready! ${finalHost}`)
          res.sendStatus(200)
        })
      })
    })
    .catch(err => {
      console.log(err)
      res.sendStatus(500)
    })
  })
})

server.listen(process.env.PORT || 3000)
